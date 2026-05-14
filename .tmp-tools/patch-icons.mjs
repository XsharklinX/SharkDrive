import { rcedit } from 'file:///E:/Programacion/Shark-Drive/.tmp-tools/node_modules/rcedit/lib/index.js';
await rcedit('E:/Programacion/Shark-Drive/app/src-tauri/target/release/bundle/nsis/SharkDrive_1.5.0_x64-setup.exe', { icon: 'E:/Programacion/Shark-Drive/app/src-tauri/icons/icon.ico' });
await rcedit('E:/Programacion/Shark-Drive/app/src-tauri/target/release/app.exe', { icon: 'E:/Programacion/Shark-Drive/app/src-tauri/icons/icon.ico' });
console.log('patched');
