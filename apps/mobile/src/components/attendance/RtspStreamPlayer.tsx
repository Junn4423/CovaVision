import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {api} from '../../services/api';

export type RtspStreamPlayerRef = {
  takeSnapshot: () => Promise<string>;
  resume: () => void;
  pause: () => void;
};

type Props = {
  cameraId: string;
  style?: ViewStyle;
  onPlaying?: () => void;
  onError?: (error: any) => void;
  onBuffering?: (buffering: any) => void;
  aspectRatio?: string;
  autoPlay?: boolean;
};

/**
 * Compatibility component name retained for the copied attendance UI.
 * Frames are fetched from CovaVision; this component never receives an RTSP
 * URL and never opens a camera socket from the device.
 */
export const RtspStreamPlayer = forwardRef<RtspStreamPlayerRef, Props>(({cameraId, style, onPlaying, onError, onBuffering, autoPlay = true}, ref) => {
  const [frame, setFrame] = useState('');
  const [loading, setLoading] = useState(Boolean(autoPlay));
  const [error, setError] = useState('');
  const pausedRef = useRef(!autoPlay);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const fetchFrame = useCallback(async () => {
    if (!cameraId || pausedRef.current || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    try {
      const response = await api.cameraSnapshot(cameraId);
      if (response?.success && response?.image_base64) {
        if (!mountedRef.current) return;
        setFrame(response.image_base64);
        setLoading(false);
        setError('');
        onPlaying?.();
        onBuffering?.({isBuffering: false});
      }
    } catch (requestError: any) {
      if (!mountedRef.current) return;
      setLoading(false);
      setError(requestError?.message || 'Không nhận được frame từ backend.');
      onError?.(requestError);
      onBuffering?.({isBuffering: false});
    } finally {
      requestInFlightRef.current = false;
    }
  }, [cameraId, onBuffering, onError, onPlaying]);

  useEffect(() => {
    mountedRef.current = true;
    pausedRef.current = !autoPlay;
    setFrame('');
    setError('');
    setLoading(Boolean(autoPlay));
    if (!autoPlay) return () => { mountedRef.current = false; };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await fetchFrame();
      if (mountedRef.current && !pausedRef.current) timer = setTimeout(poll, 80);
    };
    poll().catch(() => {});
    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [autoPlay, cameraId, fetchFrame]);

  const takeSnapshot = useCallback(async () => {
    if (frame) return frame;
    const response = await api.cameraSnapshot(cameraId);
    return response?.image_base64 || '';
  }, [cameraId, frame]);

  useImperativeHandle(ref, () => ({
    takeSnapshot,
    resume: () => { pausedRef.current = false; setLoading(true); fetchFrame().catch(() => {}); },
    pause: () => { pausedRef.current = true; },
  }), [fetchFrame, takeSnapshot]);

  return (
    <View style={[styles.container, style]}>
      {frame ? <Image source={{uri: frame}} style={styles.image} resizeMode="cover" /> : null}
      {loading && !error ? <View style={styles.overlay}><ActivityIndicator color="#38bdf8" /><Text style={styles.text}>Đang nhận hình từ CovaVision...</Text></View> : null}
      {error ? <View style={styles.overlay}><Text style={styles.errorTitle}>Camera chưa sẵn sàng</Text><Text style={styles.text}>{error}</Text></View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {backgroundColor: '#000', overflow: 'hidden', position: 'relative', justifyContent: 'center', alignItems: 'center'},
  image: {width: '100%', height: '100%'},
  overlay: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.42)', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8},
  text: {color: '#e2e8f0', fontSize: 13, textAlign: 'center'},
  errorTitle: {color: '#f87171', fontSize: 14, fontWeight: '700'},
});
