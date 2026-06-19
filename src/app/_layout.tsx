import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import {Stack} from 'expo-router';


export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
         <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />     
        <Stack.Screen name="verification" options={{ headerShown: false }} />
        <Stack.Screen name="vault" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="addpassword" options={{ headerShown: false }} />
        <Stack.Screen name="adddocument" options={{ headerShown: false }} />
        <Stack.Screen name="addcard" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="family" options={{ headerShown: false }} />
        <Stack.Screen name="security" options={{ headerShown: false }} />
         <Stack.Screen name="newmember" options={{ headerShown: false }} />
           <Stack.Screen name="signin" options={{ headerShown: false }} />
      </Stack>
      </ThemeProvider>
);
}
