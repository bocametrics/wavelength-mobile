import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = Capacitor.isNativePlatform();

window.WavelengthNative = {
  isNative,
  platform:Capacitor.getPlatform(),
  notifications: isNative ? {
    checkPermissions: () => LocalNotifications.checkPermissions(),
    requestPermissions: () => LocalNotifications.requestPermissions(),
    schedule: options => LocalNotifications.schedule(options),
    cancel: options => LocalNotifications.cancel(options),
    addActionListener: callback => LocalNotifications.addListener('localNotificationActionPerformed', callback),
  } : null,
};
