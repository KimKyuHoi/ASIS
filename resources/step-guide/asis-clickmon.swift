import Foundation
import AppKit

// asis-clickmon
// 전역 마우스 클릭을 감지해 클릭 좌표를 stdout 으로 스트리밍하는 헬퍼.
//
// 왜 별도 Swift 바이너리인가:
//   Electron globalShortcut 은 키보드 단축키만 감지하고 마우스 클릭은 잡지 못한다.
//   macOS 에서 전역 클릭을 잡는 방법은 CGEventTap 또는 NSEvent global monitor 인데,
//   NSEvent.addGlobalMonitorForEvents 가 구현이 단순하고 실측상 안정적으로 동작한다
//   ("빌드 시 컴파일해 번들에 포함" 패턴, 런타임 의존성 없음).
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
//   {"type":"key","code":<int>,"cmd":<bool>,"ctrl":<bool>,"opt":<bool>,"shift":<bool>,"chars":"<str>"}
//                                  — `--keys` 인자로 띄웠을 때만. 녹화 키 표시용(input-highlight).
//                                    ⌘·⌃ 조합과 esc·F1~F12 만 내보낸다(일반 타이핑은 프로세스 밖으로 안 나감).
//                                    클릭 라인 형식은 그대로라 인자 없이 띄우는 스텝 가이드는 영향 없음.
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

// `--keys`: 전역 keyDown 도 스트리밍한다. 키 이벤트 전역 모니터도 손쉬운 사용 신뢰가
// 필요하다 — 신뢰 여부는 위 ready 라인 하나로 함께 알린다.
// chars 는 레이아웃 의존 보조값이다. 표시 라벨은 main 이 keyCode(물리 키) 로 정하고,
// 표에 없는 키만 chars 로 대신한다.
// 단독으로 눌러도 내보내는 키 — esc, F1~F12 (kVK_Escape, kVK_F1...F12; HIToolbox Events.h).
// main 의 keyLabel.ts STANDALONE_CODES 와 같은 목록이다.
let standaloneKeyCodes: Set<UInt16> = [
  0x35, 0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F,
]

var keyMonitor: Any? = nil
if CommandLine.arguments.contains("--keys") {
  keyMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.keyDown]) { event in
    // 키 반복(꾹 누름)은 같은 조합을 연달아 보내 표시가 깜빡이기만 한다 — 첫 입력만.
    if event.isARepeat { return }
    let f = event.modifierFlags
    // 여기서 먼저 거른다 — 일반 타이핑의 글자가 파이프·main 로그로 흘러갈 여지를 없앤다.
    // ⌥ 단독은 자판에 따라 일반 글자 입력(독일어 ⌥L = @)이라 내보내지 않는다.
    let isShortcut = f.contains(.command) || f.contains(.control)
    if !isShortcut && !standaloneKeyCodes.contains(event.keyCode) { return }
    let payload: [String: Any] = [
      "type": "key",
      "code": Int(event.keyCode),
      "cmd": f.contains(.command),
      "ctrl": f.contains(.control),
      "opt": f.contains(.option),
      "shift": f.contains(.shift),
      "chars": event.charactersIgnoringModifiers ?? "",
    ]
    // chars 에 따옴표·제어문자가 올 수 있어 직접 문자열을 조립하지 않는다.
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
      let line = String(data: data, encoding: .utf8)
    else {
      FileHandle.standardError.write(Data("error key-encode-failed\n".utf8))
      return
    }
    print(line)
  }
  if keyMonitor == nil {
    FileHandle.standardError.write(Data("error key-monitor-install-failed\n".utf8))
    exit(3)
  }
}

// addGlobalMonitorForEvents 는 실패 시 nil 을 반환할 수 있다 — silent 하게 넘기지 않는다.
if monitor == nil {
  FileHandle.standardError.write(Data("error monitor-install-failed\n".utf8))
  exit(3)
}

// 부모가 kill(SIGTERM) 하면 자연 종료. run loop 를 돌린다.
app.run()
