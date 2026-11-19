// Packages Alarping for Windows x64 and embeds the icon + version info into Alarping.exe (pure JS, no wine).
const path = require('path');
const fs = require('fs');
const { packager } = require('@electron/packager');
const ResEdit = require('resedit');
const PE = require('pe-library');

(async () => {
  const root = path.resolve(__dirname, '..');
  const [outDir] = await packager({
    dir: root,
    name: 'Alarping',
    executableName: 'Alarping',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'dist'),
    overwrite: true,
    asar: true,
    prune: true,
    appVersion: '1.0.0',
    ignore: [/^\/dist/, /^\/build/, /^\/assets\/icon\.png$/],
  });
  const exePath = path.join(outDir, 'Alarping.exe');
  const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'assets', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  vi.setFileVersion(1, 0, 0, 0, 1033);
  vi.setProductVersion(1, 0, 0, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Alarping', ProductName: 'Alarping', CompanyName: 'Alarping', OriginalFilename: 'Alarping.exe',
    InternalName: 'Alarping', LegalCopyright: 'MIT', FileVersion: '1.0.0', ProductVersion: '1.0.0',
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('built', outDir);
})().catch((e) => { console.error(e); process.exit(1); });
