import { Capacitor } from "@capacitor/core";

/** true inside the Capacitor Android APK, false in the browser/PWA. */
export const isNative = () => Capacitor.isNativePlatform();
