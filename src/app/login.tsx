import { Colors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useRef, useEffect } from 'react';
import { Image, StyleSheet, Text, TextInput, useColorScheme, View, TouchableOpacity, Animated } from 'react-native';
import Logo from '../../assets/logo.png';
import { Ionicons } from '@expo/vector-icons';
import { useRouter} from 'expo-router';


const Login: React.FC = () => {
    const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light'
    const [email, setEmail] = useState('')
    const [password, setPassword]= useState('')
    const [showPassword, setShowPassword] = useState(false)
    const shimmerAnim = useRef(new Animated.Value(-400)).current;
    const router = useRouter();
    
    
      useEffect(() => {
  Animated.loop(
    Animated.timing(shimmerAnim, {
      toValue: 400,
      duration: 5000,  // slower than home screen so it's more subtle
      useNativeDriver: true,
    })
  ).start();
}, []);
  
    
    
    
    return (


    

       <LinearGradient
       colors={[
            Colors[colorScheme].background,
    Colors[colorScheme].backgroundElement,
    Colors[colorScheme].background,
         ]}
         style = {styles.container}>

          
<Image
  source={Logo}
  style={styles.logo}
  resizeMode="contain"
/>

<Text style ={[styles.title, {color: Colors[colorScheme].text}]}>Welcome Back</Text>

<View style={styles.inputWrapper}>
  <Ionicons name="mail-outline" size={20} color={Colors[colorScheme].textSecondary} />
  <TextInput
    style={[styles.input, { color: Colors[colorScheme].text }]}
    placeholder="Email"
    placeholderTextColor={Colors[colorScheme].textSecondary}
    value={email}
    onChangeText={setEmail}
    keyboardType="email-address"
    autoCapitalize="none"
  />
</View>




<View style={styles.inputWrapper}>
  <Ionicons name="lock-closed-outline" size={20} color={Colors[colorScheme].textSecondary} />
  <TextInput
    style={[styles.input, { color: Colors[colorScheme].text }]}
    placeholder="Password"
    placeholderTextColor={Colors[colorScheme].textSecondary}
    value={password}
    onChangeText={setPassword}
    secureTextEntry={!showPassword}
  />
  <TouchableOpacity onPress ={() => setShowPassword(!showPassword)}>
   <Ionicons
    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
    size={20}
    color={Colors[colorScheme].textSecondary}
    onPress={() => setShowPassword(!showPassword)}
  />
  </TouchableOpacity>
</View>


<TouchableOpacity style={styles.forgotPassword}>
  <Text style={{ color: Colors[colorScheme].textSecondary }}>Forgot Password?</Text>
</TouchableOpacity>



<TouchableOpacity style={styles.loginButton}>
  <LinearGradient
    colors={['#062958', '#4c6e9d', '#062958']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.loginButtonGradient}
  >
    <Text style={styles.loginButtonText}>Login</Text>
  </LinearGradient>
    </TouchableOpacity>



<View style={styles.signUpWrapper}>
  <Text style={{ color: Colors[colorScheme].textSecondary }}>Don't have an account? </Text>
  <TouchableOpacity onPress={() => router.push('/signup')}>
    <Text style={{ color: Colors[colorScheme].text, fontWeight: 'bold' }}>Sign Up</Text>
  </TouchableOpacity>
</View>



<Animated.View
  style={[
    styles.screenShimmer,
    { transform: [{ translateX: shimmerAnim }] },
  ]}
  pointerEvents="none"
>
  <LinearGradient
    colors={['transparent', 'rgba(255, 255, 255, 0)', 'transparent']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.screenShimmerGradient}
  />
</Animated.View>




<Animated.View
  style={[
    styles.screenShimmer,
    { transform: [{ translateX: shimmerAnim }] },
  ]}
  pointerEvents="none"
>
  <LinearGradient
    colors={['transparent', 'rgba(255, 255, 255, 0.03)', 'transparent']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.screenShimmerGradient}
  />
</Animated.View>




        </LinearGradient>
      
        
    )
}
export default Login;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },

  logo: {
  width: 300,
  height: 300,
  alignSelf: 'center',
  marginTop: 50,
  
},

title: {
  alignSelf: 'center',
  fontSize: 35,
  fontWeight: 'bold',
  marginTop: -125,
},

inputWrapper: {
  width: '100%',
  alignSelf: 'center',
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: Colors.light.textSecondary,
  borderRadius: 10,
  paddingHorizontal: 20,
  marginTop: 20,
},
input: {
  flex: 1,
  padding: 14,
  fontSize: 16,
},


forgotPassword: {
  alignSelf: 'flex-end',
  marginRight: '7.5%',
  marginTop: 8,
},


loginButton: {
  width: '100%',
  alignSelf: 'center',
  padding: 16,
  borderRadius: 10,
  marginTop: 30,
  overflow: 'hidden'
},

loginButtonText: {
  fontSize: 18,
  fontWeight: 'bold',
},

loginButtonGradient: {
  padding: 16,
  alignItems: 'center',
  borderRadius: 10,
  overflow: 'hidden'
},

signUpWrapper: {
  flexDirection: 'row',
  alignSelf: 'center',
  marginTop: 180,
},


card: {
  width: '90%',
  alignSelf: 'center',
  borderRadius: 100,
  padding: 20,
  marginTop: 60,
},

screenShimmer: {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 150,
  height: '100%',
},
screenShimmerGradient: {
  flex: 1,
},



});
