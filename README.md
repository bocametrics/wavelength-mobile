# Wavelength Mobile — iPhone deployment target

This folder is the iPhone-first, installable version of Wavelength. The original desktop HTML file remains unchanged.

## What is ready

- Mobile-first layout with iPhone safe-area support
- 44px-class touch targets, visible reorder controls, and pointer-based handle dragging
- Web App Manifest and Apple Home Screen icon
- Standalone/full-screen presentation when installed
- Offline app shell via service worker
- Backup/share and import controls under **Manage Habits**
- Existing localStorage data model and habit editing preserved

## Requirement for iPhone installation

The folder must be published at an **HTTPS URL**. Opening a Windows `file://` path or OneDrive filesystem path on an iPhone cannot provide a proper installable/offline web app.

## Once published

1. Open the HTTPS URL in Safari on the iPhone.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch Wavelength from its Home Screen icon.

## Moving data between Wavelength Mobile installations

1. In Wavelength Mobile, open **Manage Habits**.
2. Select **Backup / Share** to create a JSON backup.
3. Send the JSON file to the other device (AirDrop, Files, email to self, etc.).
4. On the destination app, open **Manage Habits → Import backup** and choose that JSON file.

### Existing Windows `file://` data

The original desktop file stores data inside that browser/file origin. A new HTTPS iPhone installation cannot read it automatically. If preserving the existing desktop history matters, add a one-time export control to the original desktop build or re-enter the current habit customizations on the iPhone. Do not assume the old data has migrated until an imported backup has been verified.

## Publish options

Preferred: GitHub Pages from this folder or another static HTTPS host such as Cloudflare Pages/Netlify. No server-side code is required.
