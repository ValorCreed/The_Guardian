// import React, { memo, useMemo } from 'react';
// import {
//   Platform,
//   StyleSheet,
//   View,
// } from 'react-native';
// import { BlurView } from 'expo-blur';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import { useAppTheme } from '../context/ThemeContext';
// import { useBlurTarget } from '../context/BlurTargetContext';

// type EdgePosition = 'top' | 'bottom';

// type ScreenEdgeBlurProps = {
//   showTop?: boolean;
//   showBottom?: boolean;
// };

// type BlurBandProps = {
//   edge: EdgePosition;
//   factor: number;
//   index: number;
//   segmentHeight: number;
//   surfaceColor: string;
//   baseIntensity: number;
//   baseScrimAlpha: number;
//   tint: 'light' | 'dark';
// };

// const BAND_FACTORS = [1, 0.74, 0.46, 0.2] as const;
// const BAND_OVERLAP = 8;

// function parseHex(value?: string | null) {
//   const clean = String(value || '')
//     .trim()
//     .replace('#', '');

//   if (/^[0-9a-f]{3}$/i.test(clean)) {
//     return {
//       r: parseInt(clean[0] + clean[0], 16),
//       g: parseInt(clean[1] + clean[1], 16),
//       b: parseInt(clean[2] + clean[2], 16),
//     };
//   }

//   if (/^[0-9a-f]{6}$/i.test(clean) || /^[0-9a-f]{8}$/i.test(clean)) {
//     return {
//       r: parseInt(clean.slice(0, 2), 16),
//       g: parseInt(clean.slice(2, 4), 16),
//       b: parseInt(clean.slice(4, 6), 16),
//     };
//   }

//   return null;
// }

// function withAlpha(value: string, alpha: number) {
//   const color = parseHex(value) || { r: 0, g: 0, b: 0 };
//   const safeAlpha = Math.max(0, Math.min(1, alpha));

//   return `rgba(${color.r}, ${color.g}, ${color.b}, ${safeAlpha})`;
// }

// function BlurBand({
//   edge,
//   factor,
//   index,
//   segmentHeight,
//   surfaceColor,
//   baseIntensity,
//   baseScrimAlpha,
//   tint,
// }: BlurBandProps) {
//   const blurTarget = useBlurTarget();

//   const offset = index * segmentHeight - (index === 0 ? 0 : BAND_OVERLAP);
//   const bandHeight = segmentHeight + BAND_OVERLAP;

//   const positionStyle =
//     edge === 'top'
//       ? { top: offset }
//       : { bottom: offset };

//   const commonStyle = [
//     styles.band,
//     positionStyle,
//     {
//       height: bandHeight,
//       backgroundColor: withAlpha(
//         surfaceColor,
//         baseScrimAlpha * factor
//       ),
//       opacity: 0.62 + factor * 0.38,
//     },
//   ];

//   if (!blurTarget?.targetRef) {
//     return <View pointerEvents="none" style={commonStyle} />;
//   }

//   return (
//     <BlurView
//       pointerEvents="none"
//       blurTarget={blurTarget.targetRef}
//       blurMethod={
//         Platform.OS === 'android'
//           ? ('dimezisBlurViewSdk31Plus' as any)
//           : undefined
//       }
//       blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
//       intensity={Math.max(1, Math.round(baseIntensity * factor))}
//       tint={tint}
//       style={commonStyle}
//     />
//   );
// }

// function ScreenEdgeBlur({
//   showTop = true,
//   showBottom = true,
// }: ScreenEdgeBlurProps) {
//   const insets = useSafeAreaInsets();
//   const { isDark, isOled, colors: C } = useAppTheme();

//   const palette = useMemo(() => {
//     const surfaceColor = isOled
//       ? '#000000'
//       : isDark
//         ? C.backgroundElement || C.background || '#0A0F14'
//         : C.surface || C.backgroundElement || C.background || '#FFFFFF';

//     return {
//       surfaceColor,
//       tint: isDark ? ('dark' as const) : ('light' as const),
//       topIntensity: Platform.OS === 'android' ? 28 : 36,
//       bottomIntensity: Platform.OS === 'android' ? 32 : 42,
//       topScrimAlpha: isOled ? 0.24 : isDark ? 0.18 : 0.2,
//       bottomScrimAlpha: isOled ? 0.27 : isDark ? 0.2 : 0.22,
//     };
//   }, [
//     C.background,
//     C.backgroundElement,
//     C.surface,
//     isDark,
//     isOled,
//   ]);

//   /*
//    * The top layer includes the system status-bar inset and then feathers into
//    * the screen. The bottom layer reaches behind the floating tab bar and the
//    * gesture/navigation inset.
//    */
//   const topHeight = Math.max(
//     insets.top + 56,
//     Platform.OS === 'android' ? 12 : 12
//   );

//   const bottomHeight = Math.max(
//     insets.bottom + 104,
//     Platform.OS === 'android' ? 12 : 12
//   );

//   const renderEdge = (
//     edge: EdgePosition,
//     height: number,
//     baseIntensity: number,
//     baseScrimAlpha: number
//   ) => {
//     const segmentHeight = height / BAND_FACTORS.length;

//     return (
//       <View
//         pointerEvents="none"
//         style={[
//           styles.edge,
//           edge === 'top' ? styles.topEdge : styles.bottomEdge,
//           { height },
//         ]}
//       >
//         {BAND_FACTORS.map((factor, index) => (
//           <BlurBand
//             key={`${edge}-${factor}`}
//             edge={edge}
//             factor={factor}
//             index={index}
//             segmentHeight={segmentHeight}
//             surfaceColor={palette.surfaceColor}
//             baseIntensity={baseIntensity}
//             baseScrimAlpha={baseScrimAlpha}
//             tint={palette.tint}
//           />
//         ))}
//       </View>
//     );
//   };

//   return (
//     <View pointerEvents="none" style={StyleSheet.absoluteFill}>
//       {showTop &&
//         renderEdge(
//           'top',
//           topHeight,
//           palette.topIntensity,
//           palette.topScrimAlpha
//         )}

//       {showBottom &&
//         renderEdge(
//           'bottom',
//           bottomHeight,
//           palette.bottomIntensity,
//           palette.bottomScrimAlpha
//         )}
//     </View>
//   );
// }

// export default memo(ScreenEdgeBlur);

// const styles = StyleSheet.create({
//   edge: {
//     position: 'absolute',
//     left: 0,
//     right: 0,
//     overflow: 'hidden',
//     zIndex: 80,
//     elevation: 80,
//   },

//   topEdge: {
//     top: 0,
//   },

//   bottomEdge: {
//     bottom: 0,
//   },

//   band: {
//     position: 'absolute',
//     left: 0,
//     right: 0,
//   },
// });