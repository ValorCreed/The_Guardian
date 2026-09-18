import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

type FloatingLabelInputProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const FloatingLabelInput = forwardRef<TextInput, FloatingLabelInputProps>(function FloatingLabelInput(
  {
    label,
    value,
    onChangeText,
    leftAccessory,
    rightAccessory,
    containerStyle,
    inputStyle,
    labelStyle,
    style,
    onFocus,
    onBlur,
    editable = true,
    multiline = false,
    ...inputProps
  },
  ref,
) {
  const { colors: C } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const active = focused || Boolean(value);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const accessoryLeft = leftAccessory ? 48 : 16;

  const legacyStyle = StyleSheet.flatten(style) as any;
  const legacyContainerStyle = legacyStyle
    ? {
        width: legacyStyle.width,
        minWidth: legacyStyle.minWidth,
        maxWidth: legacyStyle.maxWidth,
        height: legacyStyle.height,
        minHeight: legacyStyle.minHeight,
        maxHeight: legacyStyle.maxHeight,
        flex: legacyStyle.flex,
        flexGrow: legacyStyle.flexGrow,
        flexShrink: legacyStyle.flexShrink,
        alignSelf: legacyStyle.alignSelf,
        margin: legacyStyle.margin,
        marginTop: legacyStyle.marginTop,
        marginRight: legacyStyle.marginRight,
        marginBottom: legacyStyle.marginBottom,
        marginLeft: legacyStyle.marginLeft,
        marginHorizontal: legacyStyle.marginHorizontal,
        marginVertical: legacyStyle.marginVertical,
        backgroundColor: legacyStyle.backgroundColor,
        borderRadius: legacyStyle.borderRadius,
        borderWidth: legacyStyle.borderWidth,
        borderColor: legacyStyle.borderColor,
        borderTopWidth: legacyStyle.borderTopWidth,
        borderRightWidth: legacyStyle.borderRightWidth,
        borderBottomWidth: legacyStyle.borderBottomWidth,
        borderLeftWidth: legacyStyle.borderLeftWidth,
      }
    : undefined;
  const legacyInputStyle = legacyStyle
    ? {
        fontFamily: legacyStyle.fontFamily,
        fontSize: legacyStyle.fontSize,
        fontStyle: legacyStyle.fontStyle,
        fontWeight: legacyStyle.fontWeight,
        letterSpacing: legacyStyle.letterSpacing,
        lineHeight: legacyStyle.lineHeight,
        textAlign: legacyStyle.textAlign,
      }
    : undefined;

  return (
    <View
      style={[
        styles.field,
        multiline && styles.multilineField,
        {
          backgroundColor: C.background,
          borderColor: focused ? C.primary : C.border,
          opacity: editable ? 1 : 0.65,
        },
        legacyContainerStyle,
        containerStyle,
      ]}
    >
      <Animated.Text
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.label,
          {
            left: accessoryLeft,
            color: focused ? C.primary : C.tabInactive,
            top: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [multiline ? 20 : 19, 7],
            }),
            fontSize: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [15, 11],
            }),
          },
          labelStyle,
        ]}
      >
        {label}
      </Animated.Text>

      {leftAccessory ? (
        <View pointerEvents="box-none" style={styles.leftAccessory}>
          {leftAccessory}
        </View>
      ) : null}

      <TextInput
        ref={ref}
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        placeholder=""
        placeholderTextColor="transparent"
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            color: C.text,
            paddingLeft: accessoryLeft,
            paddingRight: rightAccessory ? 54 : 16,
          },
          legacyInputStyle,
          inputStyle,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />

      {rightAccessory ? (
        <View pointerEvents="box-none" style={styles.accessory}>
          {rightAccessory}
        </View>
      ) : null}
    </View>
  );
});

export default FloatingLabelInput;

const styles = StyleSheet.create({
  field: {
    minHeight: 62,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  multilineField: {
    minHeight: 120,
  },
  label: {
    position: 'absolute',
    right: 54,
    fontWeight: '800',
    zIndex: 2,
  },
  input: {
    minHeight: 62,
    fontSize: 15,
    paddingTop: 23,
    paddingBottom: 6,
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: 28,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  leftAccessory: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  accessory: {
    position: 'absolute',
    right: 8,
    top: 10,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
