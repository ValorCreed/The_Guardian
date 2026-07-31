import { useEffect } from 'react';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function IndexScreen() {
  useEffect(() => {
    const openApp = async () => {
      router.replace('/login');
      await SplashScreen.hideAsync();
    };

    openApp();
  }, []);

  return null;
}