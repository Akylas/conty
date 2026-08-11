#!/bin/sh
# Called by the shared app-tools release workflows before the build.
# The workflow only knows how to decode a single keystore (KEYSTORE_BASE64 -> KEYSTORE_PATH),
# which is the github/fdroid one. The playstore upload key is a different certificate,
# so decode it here from PLAYSTORE_KEYSTORE_BASE64 -> PLAYSTORE_KEYSTORE_PATH.
set -e

platform=''

while [ $# -gt 0 ]; do
    case "$1" in
        --platform)
            platform="$2"
            shift 2
            ;;
        --flavor | --version)
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

[ "$platform" = 'android' ] || exit 0

if [ -z "$PLAYSTORE_KEYSTORE_BASE64" ]; then
    echo "PLAYSTORE_KEYSTORE_BASE64 not set, skipping playstore keystore decoding"
    exit 0
fi

if [ -z "$PLAYSTORE_KEYSTORE_PATH" ]; then
    echo "PLAYSTORE_KEYSTORE_PATH not set while PLAYSTORE_KEYSTORE_BASE64 is" >&2
    exit 1
fi

mkdir -p "$(dirname "$PLAYSTORE_KEYSTORE_PATH")"
printf '%s' "$PLAYSTORE_KEYSTORE_BASE64" | base64 -d > "$PLAYSTORE_KEYSTORE_PATH"
echo "decoded playstore keystore to $PLAYSTORE_KEYSTORE_PATH"
