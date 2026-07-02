#!/usr/bin/env bash
set -euo pipefail

# ASIS 전역 클릭 감지 헬퍼(asis-clickmon, Swift + AppKit) 유니버설 바이너리 빌드.
# build-ocr.sh 와 동일한 패턴 — 사용자 머신에 Xcode/swiftc 가 없어도 되도록 빌드 시
# 컴파일해 앱 번들에 포함한다. AppKit(NSEvent) 은 시스템 프레임워크라 런타임 의존성 없음.

SRC="resources/step-guide/asis-clickmon.swift"
OUT_DIR="resources/bin"
OUT="$OUT_DIR/asis-clickmon"
MIN=13.0  # package.json build.mac.minimumSystemVersion 과 일치

mkdir -p "$OUT_DIR"

swiftc -O -target "arm64-apple-macos$MIN" -o "$OUT_DIR/asis-clickmon-arm64" \
  "$SRC" -framework AppKit
swiftc -O -target "x86_64-apple-macos$MIN" -o "$OUT_DIR/asis-clickmon-x64" \
  "$SRC" -framework AppKit

lipo -create -output "$OUT" "$OUT_DIR/asis-clickmon-arm64" "$OUT_DIR/asis-clickmon-x64"
rm -f "$OUT_DIR/asis-clickmon-arm64" "$OUT_DIR/asis-clickmon-x64"

echo "built: $OUT"
lipo -info "$OUT"
