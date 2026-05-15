#!/bin/bash
set -e

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  SUFFIX="arm64"
else
  SUFFIX="x64"
fi

echo "🔍 최신 버전 확인 중..."
LATEST=$(curl -s https://api.github.com/repos/KimKyuHoi/ASIS/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
VERSION="${LATEST#v}"

if [ -z "$VERSION" ]; then
  echo "❌ 최신 버전을 가져오지 못했습니다. 네트워크를 확인해주세요."
  read -r -p "Enter 키를 누르면 종료합니다..." _
  exit 1
fi

URL="https://github.com/KimKyuHoi/ASIS/releases/download/$LATEST/ASIS-$VERSION-$SUFFIX.pkg"
DEST="/tmp/ASIS-$VERSION-$SUFFIX.pkg"

echo "📥 ASIS $VERSION ($SUFFIX) 다운로드 중..."
curl -L --progress-bar -o "$DEST" "$URL"

echo "📦 설치 시작..."
open "$DEST"
