import { Platform } from 'react-native';

const shadow = (elevation, opacity = 0.08) =>
  Platform.OS === 'android'
    ? { elevation }
    : {
        shadowColor: '#1B5E20',
        shadowOffset: { width: 0, height: elevation / 2 },
        shadowOpacity: opacity,
        shadowRadius: elevation,
      };

export const shadows = {
  xs: shadow(1),
  sm: shadow(2),
  md: shadow(4, 0.10),
  lg: shadow(8, 0.12),
  xl: shadow(16, 0.15),
};
