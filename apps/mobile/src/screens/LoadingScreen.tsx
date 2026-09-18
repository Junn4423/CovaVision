import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {colors, typography, spacing} from '../design-system';
import {Icon} from '../components/Icon';

type LoadingScreenProps = {
  message: string;
};

export function LoadingScreen({message}: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <Icon name="face-recognition" size={48} color={colors.primary} />
      <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
    paddingHorizontal: spacing.xxxl,
    gap: spacing.xl,
  },
  spinner: {
    marginTop: spacing.sm,
  },
  message: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
