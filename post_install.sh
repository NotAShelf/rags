#!/usr/bin/env bash

set -euo pipefail
shopt -s nullglob

PKGDATA_DIR="${DESTDIR:-}/$2"

if [[ "$5" == "false" ]]; then
	exit 0
fi

SRC="$6"
TYPES="$PKGDATA_DIR/types"

mkdir -p "$TYPES"

tsc -p "$SRC/tsconfig.json" \
	-d \
	--declarationDir "$TYPES" \
	--emitDeclarationOnly

fixPaths() {
	sed -i 's/node_modules/types/g' "$1"
	sed -i 's/import("@girs/import("types\/@girs/g' "$1"
}

export -f fixPaths

find "$TYPES" -type f -exec bash -c '
    for file do
        fixPaths "$file"
    done
' bash {} +

cp -rL "$SRC/node_modules/@girs" "$TYPES/@girs"

# gen ags.d.ts
mod() {
	printf "declare module '%s' {\n    const exports: typeof import('%s')\n    export = exports\n}\n" "$1" "$2"
}

resource() {
	mod "resource:///com/github/Aylur/ags/$1.js" "./$1"
}

dts="$TYPES/ags.d.ts"

cp "$PKGDATA_DIR/ags.d.ts.in" "$dts"

for file in "$SRC"/src/*.ts; do
	f="$(basename -s .ts "$file")"

	if [[ "$f" != "main" && "$f" != "client" ]]; then
		resource "$f" >>"$dts"
	fi
done

for file in "$SRC"/src/service/*.ts; do
	resource "service/$(basename -s .ts "$file")" >>"$dts"
done

for file in "$SRC"/src/widgets/*.ts; do
	resource "widgets/$(basename -s .ts "$file")" >>"$dts"
done

for file in "$SRC"/src/utils/*.ts; do
	resource "utils/$(basename -s .ts "$file")" >>"$dts"
done
