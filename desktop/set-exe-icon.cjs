// يضع أيقونة البرنامج وبيانات الإصدار في Basira.exe دون الحاجة إلى ويندوز أو wine.
const fs = require("node:fs");
const path = require("node:path");
const ResEdit = require("resedit");

const exe = process.argv[2];
const ico = path.join(__dirname, "build", "icon.ico");
const version = require("./package.json").version;

const data = fs.readFileSync(exe);
const exeObj = ResEdit.NtExecutable.from(data, { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exeObj);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconFile.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: "Basira", FileDescription: "Basira — offline AI with Islamic library", CompanyName: "Stichting Tarbiyah",
  LegalCopyright: "Stichting Tarbiyah", OriginalFilename: "Basira.exe", InternalName: "Basira",
});
const [a, b, c] = version.split(".").map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.outputToResourceEntries(res.entries);
res.outputResource(exeObj);
fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
console.log("✓ icon & version set:", exe);
