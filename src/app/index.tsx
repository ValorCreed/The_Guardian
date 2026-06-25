import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';


const SplashScreen = () => {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/login');
    }, 3000); // 3 seconds

    return () => clearTimeout(timer); // cleanup
  }, []);

  return (
    <View style={styles.container}>

      {/* Shield icon box */}
      <View style={styles.iconBox}>
        <View style={styles.shield}>
          <View style={styles.checkLeft} />
          <View style={styles.checkRight} />
        </View>
      </View>

      {/* App name */}
      <Text style={styles.title}>The Guardian</Text>

      {/* Tagline */}
      <Text style={styles.subtitle}>Your Life. Protected.</Text>

    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d4a2f',
    justifyContent: 'center',
    alignItems: 'center',
  },

  iconBox: {
    width: 90,
    height: 90,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },

  shield: {
    width: 44,
    height: 50,
    borderColor: '#ffffff',
    borderWidth: 3,
    borderRadius: 4,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkLeft: {
    position: 'absolute',
    width: 3,
    height: 12,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }, { translateX: -5 }, { translateY: 3 }],
  },

  checkRight: {
    position: 'absolute',
    width: 3,
    height: 20,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }, { translateX: 5 }, { translateY: -1 }],
  },

  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    letterSpacing: 1,
  },
});