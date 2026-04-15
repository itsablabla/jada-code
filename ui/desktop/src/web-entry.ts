/**
 * Web entry point — installs Electron shims then loads the real renderer.
 */
import { installWebShims } from './web-shim';

// Install shims BEFORE anything touches window.electron
installWebShims();

// Now load the real renderer
import('./renderer');
