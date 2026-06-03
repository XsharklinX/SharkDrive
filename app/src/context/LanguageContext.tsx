import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';

export type Lang = 'en' | 'es';

const translations = {
    en: {
        // Navigation
        savedMessages: 'Saved Messages',
        recent: 'Recent',
        starred: 'Starred',
        smartFolders: 'Smart Folders',
        createFolder: 'Create Folder',
        activity: 'Activity',
        // TopBar
        addFiles: 'Add Files',
        addEncrypted: 'Add Encrypted',
        uploadFolder: 'Upload Folder',
        downloadAll: 'Download All',
        withSubfolders: 'With Subfolders',
        select: 'Select',
        // Context menu
        preview: 'Preview',
        openFolder: 'Open Folder',
        playMedia: 'Play Media',
        openPDF: 'Open PDF',
        download: 'Download',
        copyToFolder: 'Copy to Folder',
        duplicate: 'Duplicate',
        rename: 'Rename',
        shareFile: 'Share File',
        shareFolder: 'Share Folder',
        fileInfo: 'File Info',
        delete: 'Delete',
        moveToFolder: 'Move to Folder…',
        moveToRoot: 'Move to Root',
        autoEncrypt: 'Auto-encrypt',
        createSubfolder: 'Create Subfolder',
        // Empty states
        emptyFolder: 'This folder is empty',
        emptyFolderSub: 'Add files to get started',
        noResults: 'No results for',
        noResultsSub: 'Try a different search term or filter',
        noStarred: 'No starred files yet',
        noStarredSub: 'Star files to find them quickly',
        // Settings tabs
        settings: 'Settings',
        general: 'General',
        downloads: 'Downloads',
        encryption: 'Encryption',
        autoBackup: 'Auto Backup',
        sharing: 'Sharing',
        shortcuts: 'Shortcuts',
        activityTab: 'Activity',
        // Settings additions
        autoSync: 'Auto Sync',
        autoSyncDesc: 'Refresh your folders automatically without waiting for a manual sync.',
        dailySync: 'Daily scheduled sync',
        dailySyncDesc: 'Run one additional sync at a specific local time. This remains active after restarting SharkDrive.',
        desktopBehavior: 'Desktop Behavior',
        desktopBehaviorDesc: 'Choose how SharkDrive behaves when you close the window or start Windows.',
        minimizeToTray: 'Minimize to Tray',
        minimizeToTrayDesc: 'Hide to the system tray instead of exiting.',
        runAtStartup: 'Run at Startup',
        runAtStartupDesc: 'Launch SharkDrive automatically when Windows starts.',
        appearance: 'Appearance',
        appearanceDesc: 'Customize your interface accent color.',
        languageDesc: 'Interface language for SharkDrive.',
        downloadDestinations: 'Download Destinations',
        downloadDestinationsDesc: 'Route downloads by type without asking every time. Empty categories keep using the save dialog.',
        openAfterDownloadSetting: 'Open after download',
        openAfterDownloadDesc: 'Open completed files with the system default app.',
        choose: 'Choose',
        askWhereToSave: 'Ask where to save',
        localEncryption: 'Local Encryption',
        localEncryptionDesc: 'Files are encrypted on this device before upload. The key stays local.',
        encryptionActive: 'Encryption active',
        encryptionActiveDesc: 'Encrypted files can be previewed and downloaded while your password is loaded.',
        disableEncryption: 'Disable Encryption',
        autoLock: 'Auto-lock after inactivity',
        rotateKey: 'Rotate encryption key',
        rotateKeyDesc: 'Replace encrypted files safely, one at a time. Originals remain until each replacement uploads.',
        openWizard: 'Open wizard',
        encryptionAudit: 'Encryption audit',
        encryptAllPlain: 'Encrypt all plain files',
        step: 'Step',
        of: 'of',
        cancelRotation: 'Cancel',
        back: 'Back',
        continue: 'Continue',
        startRotation: 'Start rotation',
        currentPassword: 'Current password',
        newPassword: 'New password',
        passwordNotSet: 'Not set',
        passwordStrengthVeryWeak: 'Very weak',
        passwordStrengthWeak: 'Weak',
        passwordStrengthGood: 'Good',
        passwordStrengthStrong: 'Strong',
        estimatedOfflineBruteForce: 'Estimated offline brute force',
        underAMinute: 'under a minute',
        minutes: 'minutes',
        hours: 'hours',
        days: 'days',
        years: 'years',
        vaultAutoLockSet: 'Vault auto-lock set to {minutes} min',
        vaultAutoLockDisabled: 'Vault auto-lock disabled',
        closeToTrayMin: 'App will minimize to tray on close',
        closeToTrayExit: 'App will exit on close',
        runAtStartupEnabled: 'SharkDrive will start with Windows',
        runAtStartupDisabled: 'Removed from startup',
        // TopBar / search placeholders
        searchPlaceholder: 'Search files and folders',
        searchOnlyThisFolder: 'Search only in this folder',
        selectedCount: '{count} selected',
        itemsCount: '{count} items',
        clearSelection: 'Clear selection',
        selectAll: 'Select all',
        clear: 'Clear',
        grid: 'Grid',
        list: 'List',
        gallery: 'Gallery',
        name: 'Name',
        size: 'Size',
        date: 'Date',
        resetFilters: 'Reset filters and sorting',
        noFilesMatch: 'No files match this filter',
        tryAnotherFilter: 'Try another filter or reset the current view.',
        resetView: 'Reset view',
        errorLoadingFiles: 'Error loading files',
        shareAll: 'Share All',
        zip: 'ZIP',
        // Common
        cancel: 'Cancel',
        save: 'Save',
        apply: 'Apply',
        close: 'Close',
        loading: 'Loading…',
        error: 'Error',
        success: 'Success',
        sync: 'Sync',
        language: 'Language',
        english: 'English',
        spanish: 'Spanish',
        // Tray / misc
        openSharkDrive: 'Open SharkDrive',
        quit: 'Quit',
        syncNow: 'Sync Now',
        uploadFile: 'Upload File…',
        // Bulk actions
        move: 'Move',
        copy: 'Copy',
        bulkDownload: 'Download',
        bulkDelete: 'Delete',
        // v3.7 — Export & Interoperabilidad
        exportConfig: 'Export configuration',
        importConfig: 'Import configuration',
        configPassword: 'Config password (optional)',
        webhookUrl: 'Webhook URL',
        webhookEnabled: 'Enable webhook',
        webhookDesc: 'POST to this URL when an upload completes.',
        importFromCloud: 'Import from cloud',
        dropboxAppKey: 'Dropbox App Key',
        connectDropbox: 'Connect Dropbox',
        disconnectDropbox: 'Disconnect Dropbox',
        dropboxConnected: 'Dropbox connected',
        selectFilesToImport: 'Select files to import',
        startImport: 'Import to SharkDrive',
        // v3.5 — Automatización Avanzada
        wifiOnlySync: 'WiFi / LAN only sync',
        wifiOnlySyncDesc: 'Skip auto-sync when on mobile data or unknown network type.',
        autoClassify: 'Auto-classify uploads',
        autoClassifyDesc: 'Route uploaded files to specific folders based on type.',
        addRule: 'Add rule',
        fileTypes: 'File types',
        targetFolder: 'Target folder',
        runCleanupNow: 'Run cleanup now',
        noRules: 'No rules — all files go to the active folder',
        parallelUploads: 'Parallel uploads',
        parallelUploadsDesc: 'Upload up to 4 files simultaneously when queuing 4 or more.',
        // v3.3 — Multi-Cuenta
        accounts: 'Accounts',
        addAccount: 'Add account',
        switchAccount: 'Switch account',
        removeAccount: 'Remove account',
        accountAlias: 'Account name',
        accentColor: 'Accent color',
        copyToAccount: 'Copy to account…',
        preparingAccount: 'Preparing new account…',
        switchingAccount: 'Switching account…',
        downloadingFiles: 'Downloading files…',
        readyToUpload: 'Ready to upload',
        confirmSwitch: 'Switch & upload',
        crossCopyDone: 'Transfer complete',
        // v3.2 — Historial & Versiones
        versionHistory: 'Version history',
        current: 'Current',
        restore: 'Restore',
        versionHistoryHint: 'Restoring creates a new copy at the top. The original stays in history.',
        syncHistory: 'Sync History',
        noSyncHistory: 'No sync history yet',
        duplicates: 'Duplicates',
        noDuplicates: 'No duplicates found',
        rescan: 'Rescan',
        exportActivity: 'Export activity',
        extractZip: 'Extract here',
    },
    es: {
        savedMessages: 'Mensajes Guardados',
        recent: 'Recientes',
        starred: 'Destacados',
        smartFolders: 'Carpetas Inteligentes',
        createFolder: 'Crear Carpeta',
        activity: 'Actividad',
        addFiles: 'Añadir Archivos',
        addEncrypted: 'Añadir Cifrado',
        uploadFolder: 'Subir Carpeta',
        downloadAll: 'Descargar Todo',
        withSubfolders: 'Con Subcarpetas',
        select: 'Seleccionar',
        preview: 'Vista previa',
        openFolder: 'Abrir Carpeta',
        playMedia: 'Reproducir',
        openPDF: 'Abrir PDF',
        download: 'Descargar',
        copyToFolder: 'Copiar a Carpeta',
        duplicate: 'Duplicar',
        rename: 'Renombrar',
        shareFile: 'Compartir Archivo',
        shareFolder: 'Compartir Carpeta',
        fileInfo: 'Información',
        delete: 'Eliminar',
        moveToFolder: 'Mover a Carpeta…',
        moveToRoot: 'Mover a Raíz',
        autoEncrypt: 'Auto-cifrar',
        createSubfolder: 'Crear Subcarpeta',
        emptyFolder: 'Esta carpeta está vacía',
        emptyFolderSub: 'Añade archivos para comenzar',
        noResults: 'Sin resultados para',
        noResultsSub: 'Prueba otro término o filtro',
        noStarred: 'Aún no hay archivos destacados',
        noStarredSub: 'Destaca archivos para acceder rápido',
        settings: 'Configuración',
        general: 'General',
        downloads: 'Descargas',
        encryption: 'Cifrado',
        autoBackup: 'Copia Automática',
        sharing: 'Compartir',
        shortcuts: 'Atajos',
        activityTab: 'Actividad',
        // Settings additions
        autoSync: 'Sincronización Automática',
        autoSyncDesc: 'Actualiza tus carpetas automáticamente sin esperar a una sincronización manual.',
        dailySync: 'Sincronización diaria programada',
        dailySyncDesc: 'Ejecuta una sincronización adicional a una hora local específica. Permanece activa tras reiniciar.',
        desktopBehavior: 'Comportamiento de Escritorio',
        desktopBehaviorDesc: 'Elige cómo se comporta SharkDrive al cerrar la ventana o iniciar Windows.',
        minimizeToTray: 'Minimizar a la Bandeja',
        minimizeToTrayDesc: 'Ocultar en la bandeja del sistema en lugar de salir.',
        runAtStartup: 'Ejecutar al Inicio',
        runAtStartupDesc: 'Iniciar SharkDrive automáticamente al arrancar Windows.',
        appearance: 'Apariencia',
        appearanceDesc: 'Personaliza el color de acento de tu interfaz.',
        languageDesc: 'Idioma de la interfaz para SharkDrive.',
        downloadDestinations: 'Destinos de Descarga',
        downloadDestinationsDesc: 'Ruta de descargas por tipo sin preguntar siempre. Categorías vacías usarán el diálogo de guardado.',
        openAfterDownloadSetting: 'Abrir al descargar',
        openAfterDownloadDesc: 'Abrir los archivos completados con la aplicación predeterminada.',
        choose: 'Elegir',
        askWhereToSave: 'Preguntar dónde guardar',
        localEncryption: 'Cifrado Local',
        localEncryptionDesc: 'Los archivos se cifran en este dispositivo antes de subirse. La clave permanece local.',
        encryptionActive: 'Cifrado activo',
        encryptionActiveDesc: 'Los archivos cifrados se pueden previsualizar y descargar mientras la contraseña esté cargada.',
        disableEncryption: 'Desactivar Cifrado',
        autoLock: 'Auto-bloqueo por inactividad',
        rotateKey: 'Rotar clave de cifrado',
        rotateKeyDesc: 'Reemplaza archivos cifrados de forma segura, uno a uno. Los originales permanecen hasta que suba el reemplazo.',
        openWizard: 'Abrir asistente',
        encryptionAudit: 'Auditoría de cifrado',
        encryptAllPlain: 'Cifrar todos los archivos planos',
        step: 'Paso',
        of: 'de',
        cancelRotation: 'Cancelar',
        back: 'Atrás',
        continue: 'Continuar',
        startRotation: 'Comenzar rotación',
        currentPassword: 'Contraseña actual',
        newPassword: 'Nueva contraseña',
        passwordNotSet: 'No configurada',
        passwordStrengthVeryWeak: 'Muy débil',
        passwordStrengthWeak: 'Débil',
        passwordStrengthGood: 'Buena',
        passwordStrengthStrong: 'Fuerte',
        estimatedOfflineBruteForce: 'Bruto offline estimado',
        underAMinute: 'menos de un minuto',
        minutes: 'minutos',
        hours: 'horas',
        days: 'días',
        years: 'años',
        vaultAutoLockSet: 'Auto-bloqueo de bóveda a los {minutes} min',
        vaultAutoLockDisabled: 'Auto-bloqueo desactivado',
        closeToTrayMin: 'La aplicación se minimizará al cerrar',
        closeToTrayExit: 'La aplicación saldrá al cerrar',
        runAtStartupEnabled: 'SharkDrive se iniciará con Windows',
        runAtStartupDisabled: 'Eliminado del inicio',
        searchPlaceholder: 'Buscar archivos y carpetas',
        searchOnlyThisFolder: 'Buscar solo en esta carpeta',
        selectedCount: '{count} seleccionados',
        itemsCount: '{count} elementos',
        clearSelection: 'Limpiar selección',
        selectAll: 'Seleccionar todo',
        clear: 'Limpiar',
        grid: 'Cuadrícula',
        list: 'Lista',
        gallery: 'Galería',
        name: 'Nombre',
        size: 'Tamaño',
        date: 'Fecha',
        resetFilters: 'Restablecer filtros y orden',
        noFilesMatch: 'Ningún archivo coincide con este filtro',
        tryAnotherFilter: 'Prueba con otro filtro o restablece la vista actual.',
        resetView: 'Restablecer vista',
        errorLoadingFiles: 'Error al cargar archivos',
        shareAll: 'Compartir Todo',
        zip: 'ZIP',
        cancel: 'Cancelar',
        save: 'Guardar',
        apply: 'Aplicar',
        close: 'Cerrar',
        loading: 'Cargando…',
        error: 'Error',
        success: 'Éxito',
        sync: 'Sincronizar',
        language: 'Idioma',
        english: 'Inglés',
        spanish: 'Español',
        openSharkDrive: 'Abrir SharkDrive',
        quit: 'Salir',
        syncNow: 'Sincronizar ahora',
        uploadFile: 'Subir archivo…',
        move: 'Mover',
        copy: 'Copiar',
        bulkDownload: 'Descargar',
        bulkDelete: 'Eliminar',
        // v3.7
        exportConfig: 'Exportar configuración',
        importConfig: 'Importar configuración',
        configPassword: 'Contraseña de config (opcional)',
        webhookUrl: 'URL del webhook',
        webhookEnabled: 'Activar webhook',
        webhookDesc: 'POST a esta URL cuando se complete una subida.',
        importFromCloud: 'Importar desde la nube',
        dropboxAppKey: 'Clave de App Dropbox',
        connectDropbox: 'Conectar Dropbox',
        disconnectDropbox: 'Desconectar Dropbox',
        dropboxConnected: 'Dropbox conectado',
        selectFilesToImport: 'Selecciona archivos para importar',
        startImport: 'Importar a SharkDrive',
        // v3.5
        wifiOnlySync: 'Solo sincronizar con WiFi / LAN',
        wifiOnlySyncDesc: 'Omitir la sincronización automática en datos móviles o red desconocida.',
        autoClassify: 'Auto-clasificar subidas',
        autoClassifyDesc: 'Enrutar archivos subidos a carpetas específicas según el tipo.',
        addRule: 'Añadir regla',
        fileTypes: 'Tipos de archivo',
        targetFolder: 'Carpeta destino',
        runCleanupNow: 'Ejecutar limpieza ahora',
        noRules: 'Sin reglas — todos los archivos van a la carpeta activa',
        parallelUploads: 'Subidas en paralelo',
        parallelUploadsDesc: 'Subir hasta 4 archivos simultáneamente al encolar 4 o más.',
        // v3.3
        accounts: 'Cuentas',
        addAccount: 'Añadir cuenta',
        switchAccount: 'Cambiar cuenta',
        removeAccount: 'Eliminar cuenta',
        accountAlias: 'Nombre de cuenta',
        accentColor: 'Color de acento',
        copyToAccount: 'Copiar a cuenta…',
        preparingAccount: 'Preparando nueva cuenta…',
        switchingAccount: 'Cambiando cuenta…',
        downloadingFiles: 'Descargando archivos…',
        readyToUpload: 'Listo para subir',
        confirmSwitch: 'Cambiar y subir',
        crossCopyDone: 'Transferencia completa',
        // v3.2
        versionHistory: 'Historial de versiones',
        current: 'Actual',
        restore: 'Restaurar',
        versionHistoryHint: 'Restaurar crea una copia nueva al frente. El original permanece en el historial.',
        syncHistory: 'Historial de Sincronización',
        noSyncHistory: 'Aún no hay historial de sync',
        duplicates: 'Duplicados',
        noDuplicates: 'No se encontraron duplicados',
        rescan: 'Re-escanear',
        exportActivity: 'Exportar actividad',
        extractZip: 'Extraer aquí',
    },
} as const;

export type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'sharkdrive.language.v1';
const localizedTextNodes = new WeakMap<Text, string>();
const localizedAttributes = new WeakMap<Element, Map<string, string>>();
const LOCALIZED_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

const legacySpanishLabels: Record<string, string> = {
    'Telegram cloud drive': 'Unidad en la nube de Telegram',
    'Vault Dashboard': 'Panel de la b\u00f3veda',
    'Connected to Telegram': 'Conectado a Telegram',
    'Offline Mode': 'Modo sin conexi\u00f3n',
    'Offline': 'Sin conexi\u00f3n',
    'Smart folders': 'Carpetas inteligentes',
    'Pinned': 'Fijadas',
    'Folders': 'Carpetas',
    'Create Subfolder': 'Crear subcarpeta',
    'New folder name': 'Nombre de la nueva carpeta',
    'New subfolder name': 'Nombre de la nueva subcarpeta',
    'Scan for existing folders': 'Buscar carpetas existentes',
    'Syncing': 'Sincronizando',
    'Logout': 'Cerrar sesi\u00f3n',
    'Sign Out': 'Cerrar sesi\u00f3n',
    'Lock Vault': 'Bloquear b\u00f3veda',
    'Vault Locked': 'B\u00f3veda bloqueada',
    'Clear the in-memory encryption key without logging out of Telegram': 'Borrar la clave de cifrado en memoria sin cerrar la sesi\u00f3n de Telegram',
    'Keyboard Shortcuts': 'Atajos de teclado',
    'File actions': 'Acciones de archivos',
    'Navigation & media': 'Navegaci\u00f3n y multimedia',
    'Show keyboard shortcuts': 'Mostrar atajos de teclado',
    'Zoom in / out in image preview': 'Acercar o alejar la vista previa de imagen',
    'Reset zoom to 100%': 'Restablecer zoom al 100%',
    'Play / pause audio': 'Reproducir o pausar audio',
    'Previous / next file in preview': 'Archivo anterior o siguiente en vista previa',
    'Undo last rename': 'Deshacer el \u00faltimo cambio de nombre',
    'Preview not available': 'Vista previa no disponible',
    'Preview unavailable': 'Vista previa no disponible',
    'Loading preview...': 'Cargando vista previa...',
    'Retry': 'Reintentar',
    'View Text': 'Ver texto',
    'Encrypted': 'Cifrado',
    'Unknown date': 'Fecha desconocida',
    'Close preview': 'Cerrar vista previa',
    'Open text file in viewer': 'Abrir archivo de texto en el visor',
    'Zoom out (-)': 'Alejar (-)',
    'Zoom in (+)': 'Acercar (+)',
    'Reset zoom (0)': 'Restablecer zoom (0)',
    'Previous (ArrowLeft / J)': 'Anterior (Flecha izquierda / J)',
    'Next (ArrowRight / L)': 'Siguiente (Flecha derecha / L)',
    'This file type does not support in-app preview yet.': 'Este tipo de archivo todav\u00eda no admite vista previa dentro de la aplicaci\u00f3n.',
    'Rename Folder': 'Renombrar carpeta',
    'Rename File': 'Renombrar archivo',
    'New Name': 'Nuevo nombre',
    'Folder name': 'Nombre de carpeta',
    'File name': 'Nombre de archivo',
    'Renaming...': 'Renombrando...',
    'Delete File': 'Eliminar archivo',
    'Delete Files': 'Eliminar archivos',
    'Delete Folder': 'Eliminar carpeta',
    'Delete All': 'Eliminar todo',
    'This cannot be undone.': 'Esta acci\u00f3n no se puede deshacer.',
    'Results for': 'Resultados para',
    'Vault locked': 'B\u00f3veda bloqueada',
    'Encryption password': 'Contrase\u00f1a de cifrado',
    'Unlock Vault': 'Desbloquear b\u00f3veda',
    'Unlocking...': 'Desbloqueando...',
    'Something went wrong': 'Algo sali\u00f3 mal',
    'Details': 'Detalles',
    'Technical Details': 'Detalles t\u00e9cnicos',
    'Reload Application': 'Recargar aplicaci\u00f3n',
    'Update': 'Actualizar',
    'Dismiss': 'Descartar',
    'Connecting...': 'Conectando...',
    'Unlock': 'Desbloquear',
    'Unlock Telegram Session': 'Desbloquear sesi\u00f3n de Telegram',
    'Enter your 6-digit SharkDrive PIN to decrypt the saved Telegram session.': 'Introduce tu PIN de SharkDrive de 6 d\u00edgitos para descifrar la sesi\u00f3n guardada.',
    'Could not unlock the saved session. Check the PIN and retry.': 'No se pudo desbloquear la sesi\u00f3n guardada. Comprueba el PIN e int\u00e9ntalo de nuevo.',
    'Configure': 'Configurar',
    'Phone Number': 'N\u00famero de tel\u00e9fono',
    'Telegram Code': 'C\u00f3digo de Telegram',
    'Cloud Password': 'Contrase\u00f1a de la nube',
    'Sign In': 'Iniciar sesi\u00f3n',
    'Back to Configuration': 'Volver a configuraci\u00f3n',
    'Change Phone Number': 'Cambiar n\u00famero de tel\u00e9fono',
    'Back to Code Entry': 'Volver al c\u00f3digo',
    'Getting Started': 'Primeros pasos',
    'Open my.telegram.org': 'Abrir my.telegram.org',
    'Desktop Runtime Required': 'Se requiere la aplicaci\u00f3n de escritorio',
    'SharkDrive runs as a desktop app': 'SharkDrive funciona como aplicaci\u00f3n de escritorio',
    'Activity': 'Actividad',
    'Too Many Requests': 'Demasiadas solicitudes',
    'Telegram has temporarily limited your actions.': 'Telegram ha limitado temporalmente tus acciones.',
    'Please wait before trying again.': 'Espera antes de volver a intentarlo.',
    'Do not restart the app. The timer will reset if you do.': 'No reinicies la aplicaci\u00f3n. El temporizador se reiniciar\u00e1.',
    'How do I get my API credentials?': '\u00bfC\u00f3mo obtengo mis credenciales de API?',
    'Drop files to upload': 'Suelta los archivos para subirlos',
    'Files will be uploaded to the current folder': 'Los archivos se subir\u00e1n a la carpeta actual',
    'Drop to Upload': 'Suelta para subir',
    'Release to add files to SharkDrive': 'Suelta para a\u00f1adir archivos a SharkDrive',
    'Download Queue': 'Cola de descargas',
    'Upload Queue': 'Cola de subidas',
    'Cancelled': 'Cancelado',
    'Skipped': 'Omitido',
    'Move here': 'Mover aqu\u00ed',
    'Backup conflict detected': 'Se detect\u00f3 un conflicto de copia',
    'Usage Today': 'Uso de hoy',
    'Upload': 'Subida',
    'Download': 'Descarga',
    'Pattern': 'Patr\u00f3n',
    'Original': 'Original',
    'File already exists': 'El archivo ya existe',
    'File Info': 'Informaci\u00f3n del archivo',
    'No tags yet': 'A\u00fan no hay etiquetas',
    'Folder statistics': 'Estad\u00edsticas de la carpeta',
    'Files indexed locally': 'Archivos indexados localmente',
    'Total size': 'Tama\u00f1o total',
    'Other': 'Otros',
    'No images found here yet': 'A\u00fan no hay im\u00e1genes aqu\u00ed',
    'Gallery': 'Galer\u00eda',
    'Preparing stream...': 'Preparando transmisi\u00f3n...',
    'Unsupported media type': 'Tipo multimedia no compatible',
    'Streaming from Telegram': 'Transmitiendo desde Telegram',
    'Choose destination folder': 'Elige la carpeta de destino',
    'Saved Messages': 'Mensajes Guardados',
    'Loading document...': 'Cargando documento...',
    'Loading pages from Telegram storage.': 'Cargando p\u00e1ginas desde Telegram.',
    'Document error': 'Error del documento',
    'Share Links': 'Enlaces compartidos',
    'Section': 'Secci\u00f3n',
    'Enter the current password to decrypt indexed encrypted files.': 'Introduce la contrase\u00f1a actual para descifrar los archivos indexados.',
    'Choose the new local encryption password.': 'Elige la nueva contrase\u00f1a de cifrado local.',
    'Encryption audit': 'Auditor\u00eda de cifrado',
    'Protected Telegram session PIN': 'PIN de sesi\u00f3n de Telegram protegida',
    'Encryption Password': 'Contrase\u00f1a de cifrado',
    'Watching': 'Vigiladas',
    'Enabled': 'Activadas',
    'Default': 'Predeterminado',
    'No folders being watched yet.': 'A\u00fan no hay carpetas vigiladas.',
    'New and modified files will be queued automatically.': 'Los archivos nuevos y modificados se pondr\u00e1n en cola autom\u00e1ticamente.',
    'Destination': 'Destino',
    'No cleanup rules configured.': 'No hay reglas de limpieza configuradas.',
    'Loading links...': 'Cargando enlaces...',
    'No active share links.': 'No hay enlaces compartidos activos.',
    'No activity recorded yet.': 'A\u00fan no hay actividad registrada.',
    'Local Link': 'Enlace local',
    'Expiration': 'Caducidad',
    'minutes. Use 0 for never.': 'minutos. Usa 0 para nunca.',
    'Generating links...': 'Generando enlaces...',
    'Failed to generate links.': 'No se pudieron generar los enlaces.',
    'QR appears when the link is ready.': 'El QR aparecer\u00e1 cuando el enlace est\u00e9 listo.',
    'Telegram Invite': 'Invitaci\u00f3n de Telegram',
    'Local links are temporary and tracked locally. Telegram invites follow Telegram channel access rules.': 'Los enlaces locales son temporales y se registran localmente. Las invitaciones siguen las reglas de acceso de Telegram.',
    'Folder': 'Carpeta',
    'Folder Options': 'Opciones de carpeta',
    'Turn off auto-encrypt': 'Desactivar auto-cifrado',
    'Turn on auto-encrypt': 'Activar auto-cifrado',
    'Top Folders': 'Carpetas principales',
    'files': 'archivos',
    'Delete selected': 'Eliminar seleccionados',
    'Rename selected': 'Renombrar seleccionado',
    'Close or clear': 'Cerrar o limpiar',
    'Focus search': 'Enfocar b\u00fasqueda',
    'Open or preview': 'Abrir o previsualizar',
    'Images': 'Im\u00e1genes',
    'Documents': 'Documentos',
    'Large files': 'Archivos grandes',
    'Last 7 days': '\u00daltimos 7 d\u00edas',
    'Tag': 'Etiqueta',
    'Reset shortcuts': 'Restablecer atajos',
    'Keyboard actions and conflict checks': 'Acciones de teclado y comprobaci\u00f3n de conflictos',
    'Manage sync, startup, encryption, backups and activity.': 'Gestiona sincronizaci\u00f3n, inicio, cifrado, copias y actividad.',
    'Clear destination': 'Limpiar destino',
};

const dynamicSpanishLabels: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^(\d+) files$/, (count) => `${count} archivos`],
    [/^(\d+) items$/, (count) => `${count} elementos`],
    [/^(\d+) selected$/, (count) => `${count} seleccionados`],
    [/^Tag: (.+)$/, (tag) => `Etiqueta: ${tag}`],
    [/^Press \? or Esc to close$/, () => 'Presiona ? o Esc para cerrar'],
];

function translateLegacyUiText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return value;

    const translationKey = (Object.keys(translations.en) as TranslationKey[])
        .find((key) => translations.en[key] === trimmed);
    const translated = legacySpanishLabels[trimmed] ?? (translationKey ? translations.es[translationKey] : undefined);
    if (translated) return value.replace(trimmed, translated);

    for (const [pattern, translate] of dynamicSpanishLabels) {
        const match = trimmed.match(pattern);
        if (match) return value.replace(trimmed, translate(...match.slice(1)));
    }

    return value;
}

function localizeDocument(root: ParentNode, lang: Lang) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    textNodes.forEach((node) => {
        const current = node.nodeValue ?? '';
        const previousOriginal = localizedTextNodes.get(node);
        if (lang === 'es') {
            const previousTranslation = previousOriginal ? translateLegacyUiText(previousOriginal) : null;
            const original = previousOriginal && (current === previousOriginal || current === previousTranslation)
                ? previousOriginal
                : current;
            localizedTextNodes.set(node, original);
            const next = translateLegacyUiText(original);
            if (current !== next) node.nodeValue = next;
        } else if (previousOriginal && current !== previousOriginal) {
            node.nodeValue = previousOriginal;
        }
    });

    const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
    elements.forEach((element) => {
        const originals = localizedAttributes.get(element) ?? new Map<string, string>();
        LOCALIZED_ATTRIBUTES.forEach((attribute) => {
            const current = element.getAttribute(attribute);
            if (!current) return;
            const previousOriginal = originals.get(attribute);
            if (lang === 'es') {
                const previousTranslation = previousOriginal ? translateLegacyUiText(previousOriginal) : null;
                const original = previousOriginal && (current === previousOriginal || current === previousTranslation)
                    ? previousOriginal
                    : current;
                originals.set(attribute, original);
                const next = translateLegacyUiText(original);
                if (current !== next) element.setAttribute(attribute, next);
            } else if (previousOriginal && current !== previousOriginal) {
                element.setAttribute(attribute, previousOriginal);
            }
        });
        if (originals.size > 0) localizedAttributes.set(element, originals);
    });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === 'es' ? 'es' : 'en';
    });

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        localStorage.setItem(STORAGE_KEY, next);
    }, []);

    const t = useCallback((key: TranslationKey): string => {
        return translations[lang][key] ?? translations.en[key] ?? key;
    }, [lang]);

    useEffect(() => {
        localizeDocument(document.body, lang);
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof Element || node instanceof DocumentFragment) localizeDocument(node, lang);
                        if (node instanceof Text) localizeDocument(node.parentNode ?? document.body, lang);
                    });
                    return;
                }
                localizeDocument(mutation.target.parentNode ?? document.body, lang);
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [...LOCALIZED_ATTRIBUTES],
        });
        return () => observer.disconnect();
    }, [lang]);

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
}
