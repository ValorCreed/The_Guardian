import React from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';

import { safeLogError } from '../utils/asyncResilience';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  restarting: boolean;
  recoveryKey: number;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    restarting: false,
    recoveryKey: 0,
  };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    safeLogError('APP_RENDER_RECOVERY', error);
  }

  private tryAgain = () => {
    this.setState((current) => ({
      hasError: false,
      restarting: false,
      recoveryKey: current.recoveryKey + 1,
    }));
  };

  private restartApp = async () => {
    if (this.state.restarting) return;

    this.setState({ restarting: true });

    try {
      await Updates.reloadAsync();
    } catch (error: unknown) {
      safeLogError('APP_RESTART', error);
      this.setState((current) => ({
        hasError: false,
        restarting: false,
        recoveryKey: current.recoveryKey + 1,
      }));
    }
  };

  render() {
    if (!this.state.hasError) {
      return (
        <React.Fragment key={this.state.recoveryKey}>
          {this.props.children}
        </React.Fragment>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#F4F8F9" />
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name="shield-checkmark-outline" size={34} color="#0B8FAC" />
          </View>
          <Text style={styles.title}>Guardian needs a moment</Text>
          <Text style={styles.message}>
            This screen could not finish loading. Your saved data has not been changed.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.84}
            onPress={this.tryAgain}
            disabled={this.state.restarting}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.82}
            onPress={() => void this.restartApp()}
            disabled={this.state.restarting}
          >
            {this.state.restarting ? (
              <ActivityIndicator size="small" color="#0B8FAC" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#0B8FAC" />
            )}
            <Text style={styles.secondaryButtonText}>
              {this.state.restarting ? 'Restarting…' : 'Restart app'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F8F9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#D9E5E8',
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 23,
    backgroundColor: '#E8F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#10252A',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: '#587077',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#0B8FAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B9D7DD',
    backgroundColor: '#EEF8FA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 11,
  },
  secondaryButtonText: {
    color: '#0B8FAC',
    fontSize: 14,
    fontWeight: '900',
  },
});
