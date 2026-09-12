import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = Capacitor.isNativePlatform();

window.WavelengthNative = {
  isNative,
  platform:Capacitor.getPlatform(),
  geolocation: isNative ? {
    checkPermissions: () => Geolocation.checkPermissions(),
    requestPermissions: options => Geolocation.requestPermissions(options),
    getCurrentPosition: options => Geolocation.getCurrentPosition(options),
  } : null,
  notifications: isNative ? {
    checkPermissions: () => LocalNotifications.checkPermissions(),
    requestPermissions: () => LocalNotifications.requestPermissions(),
    schedule: options => LocalNotifications.schedule(options),
    cancel: options => LocalNotifications.cancel(options),
    addActionListener: callback => LocalNotifications.addListener('localNotificationActionPerformed', callback),
  } : null,
};
