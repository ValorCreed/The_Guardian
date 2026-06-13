import { Colors } from '@/constants/theme';
import { Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, useColorScheme, View } from 'react-native';
import Logo from '../../assets/logo.png';

const { width } = Dimensions.get('window');

const HomeScreen = () => {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [fontsLoaded] = useFonts({ Orbitron_700Bold });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const shimmerAnim = useRef(new Animated.Value(-500)).current;
  const router = useRouter();

  useEffect(() => {
    setTimeout(() => {
      router.replace('/login');
    }, 8000);

    // shimmer loops across full screen
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 500,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();

    // entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[
        Colors[colorScheme].background,
        Colors[colorScheme].backgroundElement,
        Colors[colorScheme].background,
        Colors[colorScheme].backgroundIdea
      ]}
      style={styles.container}
    >
      {/* logo */}
      <View style={styles.logoWrapper}>
        <Animated.Image
          source={Logo}
          style={[
            styles.logo,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        />
      </View>

      {/* full screen shimmer overlay */}
      <Animated.View
        style={[
          styles.screenShimmer,
          { transform: [{ translateX: shimmerAnim }] },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.screenShimmerGradient}
        />
      </Animated.View>
    </LinearGradient>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoWrapper: {
    width: 400,
    height: 400,
    alignSelf: 'center',
    marginTop: 150,
    overflow: 'hidden',
  },
  logo: {
    marginTop: 50,
    width: 400,
    height: 400,
  },
  screenShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 150,       // width of the shimmer streak
    height: '100%',   // full screen height
  },
  screenShimmerGradient: {
    flex: 1,
  },
});