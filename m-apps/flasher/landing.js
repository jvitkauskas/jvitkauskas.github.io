// SPDX-License-Identifier: MIT
// M-Flasher's landing page: the download dialog. It lists the latest release's files from
// GitHub, with the ones for this computer first, and after a download says what to do next.
"use strict";

const REPO = "jvitkauskas/m-flasher";
const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;

// Every download, in the order shown under "Other systems". `match` finds the file in a
// release by its name, so the page needs no change for a new version.
const OPTIONS = [
  { id: "windows", os: "windows", icon: "i-windows", title: "Windows", detail: "Windows 10 and 11", kind: ".zip", match: /-windows\.zip$/ },
  { id: "macos", os: "mac", icon: "i-apple", title: "macOS", detail: "macOS 11 or newer · Apple silicon and Intel", kind: ".dmg", match: /-macos\.dmg$/ },
  { id: "deb-x64", os: "linux", fam: "deb", arch: "x64", icon: "i-linux", title: "Debian, Ubuntu, Mint", detail: "Linux · x86-64 · Debian 12+, Ubuntu 22.04+", kind: ".deb", match: /_amd64\.deb$/ },
  { id: "rpm-x64", os: "linux", fam: "rpm", arch: "x64", icon: "i-linux", title: "Fedora, RHEL, openSUSE", detail: "Linux · x86-64 · RHEL / Alma / Rocky 10, openSUSE Tumbleweed and Leap 16", kind: ".rpm", match: /\.x86_64\.rpm$/ },
  { id: "tar-x64", os: "linux", fam: "tar", arch: "x64", icon: "i-linux", title: "Other Linux", detail: "Linux · x86-64 · glibc 2.35+", kind: ".tar.gz", match: /-linux-x86_64\.tar\.gz$/ },
  { id: "deb-arm", os: "linux", fam: "deb", arch: "arm", icon: "i-linux", title: "Debian, Ubuntu, Raspberry Pi OS", detail: "Linux · ARM64 (64-bit)", kind: ".deb", match: /_arm64\.deb$/ },
  { id: "rpm-arm", os: "linux", fam: "rpm", arch: "arm", icon: "i-linux", title: "Fedora, RHEL, openSUSE", detail: "Linux · ARM64", kind: ".rpm", match: /\.aarch64\.rpm$/ },
  { id: "tar-arm", os: "linux", fam: "tar", arch: "arm", icon: "i-linux", title: "Other Linux", detail: "Linux · ARM64 · glibc 2.35+", kind: ".tar.gz", match: /-linux-aarch64\.tar\.gz$/ },
];

// What to do once it's downloaded (as in the release notes). `file` is the file's name.
const NEXT = {
  windows: () => [
    "Extract the zip and run <b>M-Flasher.exe</b>.",
    "The first time, Windows may say it protected your PC: <b>More info → Run anyway</b>. When it finds the unit, Windows asks to let it make changes: it needs administrator rights to talk to the unit.",
  ],
  mac: () => [
    "Open it and drag <b>M-Flasher</b> to Applications.",
    "The first time, macOS blocks it: <b>System Settings → Privacy & Security → Open Anyway</b>. When it finds the unit, it asks for your password, and once to let it access a removable volume (the unit): <b>Allow</b>.",
  ],
  deb: (file) => [`Install it with <code>sudo apt install ./${file}</code>, connect the unit, and start M-Flasher from the app menu.`],
  rpm: (file) => [`Install it with <code>sudo dnf install ./${file}</code> (openSUSE: <code>sudo zypper install ./${file}</code>), connect the unit, and start M-Flasher from the app menu.`],
  tar: () => ["Extract it and follow its <b>README.txt</b>: install the udev rule once, connect the unit, and run <code>m-flasher</code> as yourself."],
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// This computer: { os: windows | mac | linux | mobile | other, arch: x64 | arm | null, fam: deb | rpm | null }
async function detect() {
  const ua = navigator.userAgent;
  const hints = navigator.userAgentData;
  const platform = (hints && hints.platform) || navigator.platform || "";
  let os = "other";
  if (/Android|iPhone|iPad|iPod/i.test(ua) || platform === "Android") os = "mobile";
  else if (/Win/i.test(platform) || /Windows/.test(ua)) os = "windows";
  else if (/Mac/i.test(platform) || /Macintosh/.test(ua)) os = navigator.maxTouchPoints > 1 ? "mobile" : "mac"; // an iPad says it's a Mac
  else if (/Linux|CrOS|X11/i.test(platform + " " + ua)) os = "linux";
  let arch = /aarch64|arm64|armv8/i.test(ua) ? "arm" : /x86_64|x64|amd64|Win64|WOW64/i.test(ua) ? "x64" : null;
  if (hints && hints.getHighEntropyValues) {
    try {
      const v = await hints.getHighEntropyValues(["architecture"]);
      if (v.architecture) arch = v.architecture.startsWith("arm") ? "arm" : "x64";
    } catch { /* not given */ }
  }
  const fam = /Fedora|Red Hat|CentOS|Rocky|AlmaLinux|SUSE/i.test(ua) ? "rpm" : /Ubuntu|Debian|Mint|Raspbian/i.test(ua) ? "deb" : null;
  return { os, arch, fam };
}

// The options for this computer, best first.
function recommended({ os, arch, fam }) {
  if (os === "windows" || os === "mac") return OPTIONS.filter((o) => o.os === os);
  if (os !== "linux") return [];
  const a = arch || "x64";
  const order = fam === "rpm" ? ["rpm", "deb", "tar"] : ["deb", "rpm", "tar"];
  return order.map((f) => OPTIONS.find((o) => o.fam === f && o.arch === a));
}

// The latest release: { tag, page, files: name -> url }, or null.
let release;
async function latestRelease() {
  if (release !== undefined) return release;
  try {
    const cached = sessionStorage.getItem("m-flasher-release");
    if (cached) return (release = JSON.parse(cached));
  } catch { /* storage off */ }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    release = { tag: d.tag_name, page: d.html_url, files: Object.fromEntries(d.assets.map((a) => [a.name, a.browser_download_url])) };
    try { sessionStorage.setItem("m-flasher-release", JSON.stringify(release)); } catch { /* storage off */ }
  } catch {
    release = null;
  }
  return release;
}

function optionLink(option, rel) {
  const name = rel ? Object.keys(rel.files).find((n) => option.match.test(n)) : null;
  const a = document.createElement("a");
  a.className = "option";
  a.href = name ? rel.files[name] : (rel && rel.page) || RELEASE_PAGE;
  a.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${option.icon}"/></svg>`
    + `<span class="text"><span class="title"></span><span class="detail"></span></span><span class="kind"></span>`;
  a.querySelector(".title").textContent = option.title;
  a.querySelector(".detail").textContent = option.detail;
  a.querySelector(".kind").textContent = option.kind;
  a.addEventListener("click", () => showNext(a, option, name || ""));
  return a;
}

// Under the button that was used.
function showNext(link, option, file) {
  const steps = NEXT[option.fam || option.os](escapeHtml(file || `m-flasher${option.kind}`));
  const next = $("dl-next");
  link.after(next);
  next.innerHTML = `<h3>After the download</h3>` + steps.map((s) => `<p>${s}</p>`).join("")
    + `<p>Then put the unit in download mode and connect it: M-Flasher shows how. More in the <a href="https://github.com/${REPO}/blob/main/docs/usage.md">usage guide</a>.</p>`;
  next.hidden = false;
  next.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function fill() {
  const [system, rel] = await Promise.all([detect(), latestRelease()]);
  const best = recommended(system);
  const rest = OPTIONS.filter((o) => !best.includes(o));
  $("dl-recommended").replaceChildren(...best.map((o) => optionLink(o, rel)));
  $("dl-others").replaceChildren(...rest.map((o) => optionLink(o, rel)));
  $("dl-recommended-wrap").hidden = best.length === 0;
  $("dl-recommended-label").textContent = system.os === "linux" ? "For this computer: pick your distribution" : "For this computer";
  $("dl-others-label").textContent = best.length ? `Other systems (${rest.length})` : "Choose your system";
  $("dl-others-wrap").open = best.length === 0;
  $("dl-mobile").hidden = system.os !== "mobile";
  $("dl-fallback").hidden = !!rel;
  if (rel) {
    $("dl-sub").textContent = `M-Flasher ${rel.tag.replace(/^v/, "")}, the latest release`;
    $("dl-release").href = rel.page;
  }
}

const dialog = $("downloads");
$("download").addEventListener("click", async () => {
  const next = $("dl-next");
  next.hidden = true;
  dialog.querySelector(".dlg").append(next); // back out of the lists before they're rebuilt
  await fill();
  dialog.showModal();
  const first = dialog.querySelector(".option");
  if (first) first.focus();
});
$("dl-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // outside it

// The version under the button
latestRelease().then((rel) => {
  if (rel) $("hero-version").textContent = ` · version ${rel.tag.replace(/^v/, "")}`;
});
