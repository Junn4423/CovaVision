import React, {useRef} from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {CaptchaData} from '../utils/captcha';

type SliderCaptchaProps = {
  captchaData: CaptchaData | null;
  targetX: number;
  targetY: number;
  imgIndex: number;
  onCancel: () => void;
  onVerify: (x: number) => void;
};

export const SliderCaptcha = ({
  captchaData,
  targetX,
  targetY,
  imgIndex,
  onCancel,
  onVerify,
}: SliderCaptchaProps) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const captchaStateRef = useRef({targetX});

  // Keep ref up to date so pan responder can read latest values
  captchaStateRef.current = {targetX};

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, {dx: pan.x}], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (e, gesture) => {
        // Calculate the drop X
        const finalX = Math.max(0, Math.min(268, gesture.dx)); // 310 - 42 = 268 max slide
        
        // Trigger verification callback with the final X position
        onVerify(finalX);
        
        // Reset the slider position
        Animated.spring(pan, {
          toValue: {x: 0, y: 0},
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  if (!captchaData) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Xác minh bảo mật</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancelBtn}>Hủy bỏ</Text>
        </TouchableOpacity>
      </View>

      {/* Image Area */}
      <View style={styles.imageContainer}>
        {/* Background Image */}
        <Image
          source={{uri: `https://picsum.photos/seed/${imgIndex}/310/155`}}
          style={styles.fullImage}
        />

        {/* Target Hole */}
        <View
          style={[
            styles.targetHole,
            {left: targetX, top: targetY},
          ]}
        />

        {/* Movable Puzzle Piece */}
        <Animated.View
          style={[
            styles.puzzlePieceContainer,
            {top: targetY},
            {
              transform: [
                {
                  translateX: pan.x.interpolate({
                    inputRange: [0, 268],
                    outputRange: [0, 268],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}>
          <Image
            source={{uri: `https://picsum.photos/seed/${imgIndex}/310/155`}}
            style={[
              styles.puzzleImage,
              {top: -targetY, left: -targetX},
            ]}
          />
        </Animated.View>
      </View>

      {/* Slider Track */}
      <View style={styles.sliderTrack}>
        <Text style={styles.sliderHint}>Kéo thanh trượt để ghép hình</Text>

        {/* Fill Background */}
        <Animated.View
          style={[
            styles.sliderFill,
            {
              width: pan.x.interpolate({
                inputRange: [0, 268],
                outputRange: [40, 308],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />

        {/* Draggable Knob */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sliderKnob,
            {
              transform: [
                {
                  translateX: pan.x.interpolate({
                    inputRange: [0, 268],
                    outputRange: [0, 268],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}>
          <Text style={styles.knobIcon}>|||</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: '#0f426c',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelBtn: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  imageContainer: {
    width: 310,
    height: 155,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  targetHole: {
    position: 'absolute',
    width: 42,
    height: 42,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  puzzlePieceContainer: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.6,
    shadowRadius: 5,
    elevation: 6,
  },
  puzzleImage: {
    width: 310,
    height: 155,
    position: 'absolute',
  },
  sliderTrack: {
    marginTop: 15,
    width: 310,
    height: 40,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
    alignSelf: 'center',
  },
  sliderHint: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#dbeafe',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  sliderKnob: {
    position: 'absolute',
    left: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  knobIcon: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
