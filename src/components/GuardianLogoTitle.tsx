import React from 'react';
import {
  Image,
  ImageBackground,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

const GUARDIAN_LOGO = require('../assets/ForegroundIconGuardianTrans.png');
const LOGO_BACKGROUND = require('../assets/BackgroundImage.png');

type GuardianLogoTileProps = {
  size?: number;
  logoSize?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export default function GuardianLogoTile({
  size = 62,
  logoSize = 50,
  radius = 18,
  style,
}: GuardianLogoTileProps) {
  return (
    <ImageBackground
      source={LOGO_BACKGROUND}
      resizeMode="cover"
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style,
      ]}
      imageStyle={{
        borderRadius: radius,
      }}
    >
      <Image
        source={GUARDIAN_LOGO}
        style={{
          width: logoSize,
          height: logoSize,
        }}
        resizeMode="contain"
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#061A12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});