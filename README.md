# srt-fixer

Fix overlapping SRT subtitles by injecting ASS alignment tags (`{\anX}`) to place simultaneous lines in different screen positions. Also supports converting `.ass` files to styled SRT output.

**Quick Start**
```bash
bun install
bun run index.ts -- input.srt output.srt
```

**CLI Usage**
```bash
srt-fixer --in input.srt [--out output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]
srt-fixer input.srt [output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]
```

If the input is `.ass`, the tool converts it to SRT and preserves common style hints as HTML `<font>` tags plus leading `{\anX}` alignment tags.

**Options**
- `--clean` Remove existing `{\anX}` tags before processing.
- `--ignore-existing` Keep existing leading `{\anX}` tags and reserve their slots.
- `--omit-default` Do not add `{\an2}` when it is the assigned tag (default).
- `--keep-default` Always add `{\an2}` when it is the assigned tag.
- `--keep-white` Preserve `#ffffff` color tags when converting from ASS.

**Build An Executable**
```bash
bun build --compile index.ts --outfile srt-fixer
```

This project was created using `bun init` in bun v1.3.6. Bun is a fast all-in-one JavaScript runtime.
