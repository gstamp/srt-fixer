# srt-fixer

Fix overlapping SRT subtitles by injecting ASS alignment tags (`{\anX}`) to place simultaneous lines in different screen positions. Also supports converting `.ass` files to styled SRT output.

**Quick Start**
```bash
bun install
srt-fixer input.srt output.srt
```
If `srt-fixer` is not on your PATH yet, build the binary first:
```bash
bun build --compile index.ts --outfile srt-fixer
```

**Common Use Cases**
- Fix a single file and write to a new output:
```bash
srt-fixer input.srt output.srt
```
- Fix a single file and overwrite it in place:
```bash
srt-fixer --in-place input.srt
```
- Fix a whole folder and write all outputs into a new directory:
```bash
srt-fixer --out-dir fixed subtitles/*.srt
```
- Fix a whole folder and keep outputs next to inputs with a suffix:
```bash
srt-fixer --suffix .fixed subtitles/*.srt
```
- Convert a whole folder of ASS files to SRT next to each input (default for multiple `.ass`):
```bash
srt-fixer subtitles/*.ass
```
- Convert a whole folder of ASS files into a new directory:
```bash
srt-fixer --out-dir srt_out subtitles/*.ass
```

**CLI Usage**
```bash
srt-fixer --in input.srt [--out output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]
srt-fixer input.srt [output.srt] [--clean] [--ignore-existing] [--keep-default] [--keep-white]
srt-fixer [--in-place | --out-dir dir | --suffix .fixed] input1.srt [input2.srt ...]
srt-fixer *.ass
```

If the input is `.ass`, the tool converts it to SRT and preserves common style hints as HTML `<font>` tags plus leading `{\anX}` alignment tags.
For multiple `.ass` inputs, outputs are written next to each input by default.
Mixed `.ass` and `.srt` batches are not supported.
`--in-place` is not valid for `.ass` inputs.

**Options**
- `--clean` Remove existing `{\anX}` tags before processing.
- `--ignore-existing` Keep existing leading `{\anX}` tags and reserve their slots.
- `--omit-default` Do not add `{\an2}` when it is the assigned tag (default).
- `--keep-default` Always add `{\an2}` when it is the assigned tag.
- `--keep-white` Preserve `#ffffff` color tags when converting from ASS.
- `--in-place` Overwrite each input file in place.
- `--out-dir dir` Write outputs into the given directory (batch-friendly).
- `--suffix text` Write outputs next to inputs, inserting the suffix before `.srt`.

**Build An Executable**
```bash
bun build --compile index.ts --outfile srt-fixer
```

This project was created using `bun init` in bun v1.3.6. Bun is a fast all-in-one JavaScript runtime.
