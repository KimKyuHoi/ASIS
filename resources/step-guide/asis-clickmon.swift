import Foundation
import AppKit

// asis-clickmon
// 전역 마우스 클릭을 감지해 클릭 좌표를 stdout 으로 스트리밍하는 헬퍼.
//
// 왜 별도 Swift 바이너리인가:
//   Electron globalShortcut 은 키보드 단축키만 감지하고 마우스 클릭은 잡지 못한다.
//   macOS 에서 전역 클릭을 잡는 방법은 CGEventTap 또는 NSEvent global monitor 인데,
//   NSEvent.addGlobalMonitorForEvents 가 구현이 단순하고 실측상 안정적으로 동작한다
//   (asis-ocr 와 동일한 "빌드 시 컴파일해 번들에 포함" 패턴, 런타임 의존성 없음).
//
// 동작:
//   - NSApplication accessory 모드로 run loop 를 돌린다(Dock/메뉴바에 안 뜸).
//   - leftMouseDown 전역 이벤트마다 NSEvent.mouseLocation(전역 커서, bottom-left origin)
//     을 읽어, 메인 디스플레이 높이 기준으로 top-left origin 으로 뒤집은 뒤 JSON 한 줄로 출력.
//   - 출력 좌표계 = screencapture -R / Electron screen API 와 동일(top-left, points).
//
// 좌표 flip:
//   NSEvent.mouseLocation 은 bottom-left origin. screencapture 는 top-left origin.
//   flip: topLeftY = mainDisplayHeight - nsEventY.
//   mainDisplayHeight = NSScreen.screens[0].frame.height (전역 원점/메뉴바가 있는 디스플레이).
//   실측(PoC): CG top-left (700,250) 로 posting 한 클릭이 {"x":700,"y":250} 으로 출력됨 — 일치.
//
//   한계(정직히): 이 flip 은 메인 디스플레이 기준이다. 세컨더리 디스플레이에서 클릭하면
//   Electron 의 screen.getDisplayNearestPoint 로 실제 캡처 대상 디스플레이를 다시 찾는 것이
//   더 정확할 수 있다. main 은 이 좌표를 "어느 디스플레이인지" 판별용으로 쓰고,
//   실제 캡처 rect 는 그 디스플레이 bounds 로 계산하므로 flip 오차가 결과에 영향을 주지 않는다.
//
// 권한:
//   전역 mouse-down 을 받으려면 앱이 손쉬운 사용(Accessibility) 신뢰 클라이언트여야 한다.
//   신뢰되지 않으면 콜백이 호출되지 않는다(조용히 이벤트 미수신). 시작 시 신뢰 여부를
//   stderr 로 알려 main 이 사용자에게 안내할 수 있게 한다.
//
// 프로토콜(stdout, 한 줄 = 한 이벤트):
//   {"x":<int>,"y":<int>}          — 클릭 좌표(top-left, points)
// 프로토콜(stderr):
//   ready trusted=<true|false>     — 시작 알림 + AX 신뢰 여부
//   error <message>                — 비정상

// stdout 을 unbuffered 로 — 부모(Node)가 클릭 즉시 한 줄씩 읽을 수 있게.
setbuf(stdout, nil)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

// 메인 디스플레이(전역 원점) 높이 — flip 기준. 디스플레이 구성이 바뀔 수 있으므로
// 매 클릭마다 조회한다(호출 비용은 무시할 수준).
func mainDisplayHeight() -> CGFloat {
  return NSScreen.screens.first?.frame.height ?? 0
}

let trusted = AXIsProcessTrusted()
FileHandle.standardError.write(Data("ready trusted=\(trusted)\n".utf8))

let monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown]) { _ in
  let m = NSEvent.mouseLocation
  let topLeftY = mainDisplayHeight() - m.y
  let x = Int(m.x.rounded())
  let y = Int(topLeftY.rounded())
  print("{\"x\":\(x),\"y\":\(y)}")
}

// addGlobalMonitorForEvents 는 실패 시 nil 을 반환할 수 있다 — silent 하게 넘기지 않는다.
if monitor == nil {
  FileHandle.standardError.write(Data("error monitor-install-failed\n".utf8))
  exit(3)
}

// 부모가 kill(SIGTERM) 하면 자연 종료. run loop 를 돌린다.
app.run()
