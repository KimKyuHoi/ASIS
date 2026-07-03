#!/usr/bin/env bash
set -euo pipefail

# ASIS 배경 제거 헬퍼(Swift + Vision) 유니버설 바이너리 빌드.
# 사용자 머신에 Xcode/swiftc 가 없어도 되도록 빌드 시 컴파일해 앱 번들에 포함한다
# (build-ocr.sh 와 동일한 결). Vision 은 macOS 시스템 프레임워크라 런타임 의존성 없음.
#
# 주의: VNGenerateForegroundInstanceMaskRequest 는 macOS 14+ 전용 API 지만,
# 바이너리 자체는 min target 13.0 으로 빌드하고 소스에서 #available(macOS 14, *)
# 로 런타임 게이팅한다. 13.x 에서 실행되면 exit 7 로 "미지원" 을 알린다.

SRC="resources/background-remove/asis-bgremove.swift"
OUT_DIR="resources/bin"
OUT="$OUT_DIR/asis-bgremove"
MIN=13.0  # package.json build.mac.minimumSystemVersion 과 일치

mkdir -p "$OUT_DIR"

swiftc -O -target "arm64-apple-macos$MIN" -o "$OUT_DIR/asis-bgremove-arm64" \
  "$SRC" -framework Vision -framework AppKit -framework CoreImage -framework ImageIO
swiftc -O -target "x86_64-apple-macos$MIN" -o "$OUT_DIR/asis-bgremove-x64" \
  "$SRC" -framework Vision -framework AppKit -framework CoreImage -framework ImageIO

lipo -create -output "$OUT" "$OUT_DIR/asis-bgremove-arm64" "$OUT_DIR/asis-bgremove-x64"
rm -f "$OUT_DIR/asis-bgremove-arm64" "$OUT_DIR/asis-bgremove-x64"

echo "built: $OUT"
lipo -info "$OUT"
