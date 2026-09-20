import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import {
  BOTTOMS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  TOPS,
  bodyMetrics,
  normalizeAvatar,
  type AvatarConfig,
  type AvatarPose,
} from '@/lib/avatar';
import { colors } from '@/lib/theme';

type Props = {
  config?: Partial<AvatarConfig> | null;
  pose?: AvatarPose;
  size?: number;
  style?: ViewStyle;
};

const PX = 4; // base pixel unit at size 80

/**
 * Layered View pixel person — chunky blocks, no external art assets.
 * Pose tweaks arms/hands for tab flavors (idle / curl / eat / think).
 */
export function PixelAvatar({ config, pose = 'idle', size = 80, style }: Props) {
  const a = useMemo(() => normalizeAvatar(config), [config]);
  const m = bodyMetrics(a.bodyType);
  const scale = size / 80;
  const u = PX * scale;

  const skin = SKIN_TONES[a.skinTone];
  const eyes = EYE_COLORS[a.eyeColor];
  const hair = HAIR_COLORS[a.hairColor];
  const topColor = TOPS[a.top].color;
  const bottomColor = BOTTOMS[a.bottom].color;

  const head = 14 * u * m.head;
  const torsoW = 18 * u * m.torsoW;
  const torsoH = 16 * u * m.torsoH;
  const hipW = 18 * u * m.hipW;
  const armW = 5 * u * m.armW;
  const armH = 14 * u;
  const legW = 7 * u * m.legW;
  const legH = 16 * u;
  const stageW = Math.max(torsoW, hipW) + armW * 2 + 8 * u;
  const stageH = head + torsoH + legH + 10 * u;

  const isTank = a.top === 1;
  const isCrop = a.top === 3;
  const isHoodie = a.top === 2;

  // Pose: arm offsets / extras
  const leftArmStyle = poseArm('left', pose, armW, armH, u);
  const rightArmStyle = poseArm('right', pose, armW, armH, u);

  return (
    <View
      style={[
        styles.stage,
        {
          width: stageW,
          height: stageH,
          transform: [{ scale: 1 }],
        },
        style,
      ]}
      accessibilityLabel="Pixel avatar"
    >
      {/* Cap / headband sit above hair */}
      {a.accessory === 1 ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            alignSelf: 'center',
            width: head * 1.15,
            height: head * 0.35,
            backgroundColor: '#c8c8c8',
            borderRadius: 1,
            zIndex: 5,
            left: (stageW - head * 1.15) / 2,
          }}
        />
      ) : null}
      {a.accessory === 2 ? (
        <View
          style={{
            position: 'absolute',
            top: head * 0.35,
            left: (stageW - head * 1.05) / 2,
            width: head * 1.05,
            height: 2.5 * u,
            backgroundColor: colors.accent,
            zIndex: 5,
          }}
        />
      ) : null}

      {/* Hair back / bun */}
      {(a.hairStyle === 3 || a.hairStyle === 4 || a.hairStyle === 5) && (
        <View
          style={{
            position: 'absolute',
            top: a.hairStyle === 5 ? head * 0.15 : head * 0.55,
            left: (stageW - head * (a.hairStyle === 5 ? 0.55 : 1.05)) / 2,
            width: head * (a.hairStyle === 5 ? 0.55 : 1.05),
            height: a.hairStyle === 5 ? head * 0.45 : head * (a.hairStyle === 4 ? 0.9 : 1.1),
            backgroundColor: hair,
            borderRadius: a.hairStyle === 5 ? head : 2,
            zIndex: 0,
          }}
        />
      )}

      {/* Head */}
      <View
        style={{
          position: 'absolute',
          top: 2 * u,
          left: (stageW - head) / 2,
          width: head,
          height: head,
          backgroundColor: skin,
          borderRadius: 2,
          zIndex: 2,
        }}
      >
        {/* Hair top */}
        {a.hairStyle !== 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: a.hairStyle === 1 ? head * 0.28 : head * 0.42,
              backgroundColor: hair,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            }}
          />
        )}
        {a.hairStyle === 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: head * 0.1,
              right: head * 0.1,
              height: head * 0.12,
              backgroundColor: hair,
            }}
          />
        )}

        {/* Eyes */}
        <View
          style={{
            position: 'absolute',
            top: head * 0.48,
            left: head * 0.22,
            width: head * 0.16,
            height: head * 0.14,
            backgroundColor: eyes,
            borderRadius: 1,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: head * 0.48,
            right: head * 0.22,
            width: head * 0.16,
            height: head * 0.14,
            backgroundColor: eyes,
            borderRadius: 1,
          }}
        />

        {/* Glasses */}
        {a.accessory === 3 && (
          <View
            style={{
              position: 'absolute',
              top: head * 0.44,
              left: head * 0.12,
              right: head * 0.12,
              height: head * 0.22,
              borderWidth: 1.5 * scale,
              borderColor: '#222',
              borderRadius: 2,
              flexDirection: 'row',
            }}
          >
            <View style={{ flex: 1, borderRightWidth: 1.5 * scale, borderColor: '#222' }} />
            <View style={{ flex: 1 }} />
          </View>
        )}

        {/* Facial hair */}
        {a.facialHair === 1 && (
          <View
            style={{
              position: 'absolute',
              bottom: head * 0.12,
              left: head * 0.2,
              right: head * 0.2,
              height: head * 0.18,
              backgroundColor: hair,
              opacity: 0.45,
            }}
          />
        )}
        {a.facialHair === 2 && (
          <View
            style={{
              position: 'absolute',
              bottom: head * 0.28,
              left: head * 0.28,
              right: head * 0.28,
              height: head * 0.1,
              backgroundColor: hair,
            }}
          />
        )}
        {a.facialHair === 3 && (
          <View
            style={{
              position: 'absolute',
              bottom: -head * 0.08,
              left: head * 0.15,
              right: head * 0.15,
              height: head * 0.35,
              backgroundColor: hair,
              borderRadius: 2,
            }}
          />
        )}
      </View>

      {/* Ponytail side flick */}
      {a.hairStyle === 4 && (
        <View
          style={{
            position: 'absolute',
            top: head * 0.7,
            right: (stageW - head) / 2 - 3 * u,
            width: 4 * u,
            height: 10 * u,
            backgroundColor: hair,
            borderRadius: 2,
            zIndex: 1,
          }}
        />
      )}

      {/* Neck */}
      <View
        style={{
          position: 'absolute',
          top: 2 * u + head - u,
          left: (stageW - 4 * u) / 2,
          width: 4 * u,
          height: 3 * u,
          backgroundColor: skin,
          zIndex: 1,
        }}
      />

      {/* Torso + clothes */}
      <View
        style={{
          position: 'absolute',
          top: 2 * u + head + 2 * u,
          left: (stageW - torsoW) / 2,
          width: torsoW,
          height: isCrop ? torsoH * 0.7 : torsoH,
          backgroundColor: topColor,
          borderRadius: 2,
          zIndex: 2,
        }}
      >
        {isTank && (
          <>
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: torsoW * 0.18,
                height: torsoH * 0.35,
                backgroundColor: skin,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: torsoW * 0.18,
                height: torsoH * 0.35,
                backgroundColor: skin,
              }}
            />
          </>
        )}
        {isHoodie && (
          <View
            style={{
              position: 'absolute',
              top: -2 * u,
              left: torsoW * 0.15,
              width: torsoW * 0.7,
              height: 3 * u,
              backgroundColor: topColor,
              borderRadius: 2,
            }}
          />
        )}
        {/* Jersey stripe */}
        {a.top === 4 && (
          <View
            style={{
              position: 'absolute',
              top: torsoH * 0.35,
              left: 0,
              right: 0,
              height: 2.5 * u,
              backgroundColor: '#fff',
              opacity: 0.85,
            }}
          />
        )}
      </View>

      {/* Arms */}
      <View
        style={[
          {
            position: 'absolute',
            top: 2 * u + head + 3 * u,
            left: (stageW - torsoW) / 2 - armW + u,
            width: armW,
            height: armH,
            backgroundColor: isTank || isCrop ? skin : topColor,
            borderRadius: 1,
            zIndex: 1,
          },
          leftArmStyle,
        ]}
      />
      <View
        style={[
          {
            position: 'absolute',
            top: 2 * u + head + 3 * u,
            right: (stageW - torsoW) / 2 - armW + u,
            width: armW,
            height: armH,
            backgroundColor: isTank || isCrop ? skin : topColor,
            borderRadius: 1,
            zIndex: 1,
          },
          rightArmStyle,
        ]}
      />

      {/* Pose props */}
      {pose === 'curl' && (
        <View
          style={{
            position: 'absolute',
            top: 2 * u + head + 8 * u,
            right: (stageW - torsoW) / 2 - armW - 2 * u,
            width: 8 * u,
            height: 2.5 * u,
            backgroundColor: '#888',
            borderRadius: 1,
            zIndex: 3,
          }}
        />
      )}
      {pose === 'eat' && (
        <View
          style={{
            position: 'absolute',
            top: 2 * u + head + 6 * u,
            left: (stageW - torsoW) / 2 - 6 * u,
            width: 5 * u,
            height: 5 * u,
            backgroundColor: '#a0a0a0',
            borderRadius: 1,
            zIndex: 3,
          }}
        />
      )}
      {pose === 'think' && (
        <View
          style={{
            position: 'absolute',
            top: 2 * u + head * 0.2,
            right: (stageW - head) / 2 - 6 * u,
            width: 3 * u,
            height: 3 * u,
            borderRadius: 2,
            borderWidth: 1.5 * scale,
            borderColor: colors.accent,
            zIndex: 4,
          }}
        />
      )}

      {/* Hips / bottoms */}
      <View
        style={{
          position: 'absolute',
          top: 2 * u + head + 2 * u + (isCrop ? torsoH * 0.7 : torsoH) - 2 * u,
          left: (stageW - hipW) / 2,
          width: hipW,
          height: 6 * u,
          backgroundColor: bottomColor,
          borderRadius: 1,
          zIndex: 2,
        }}
      />

      {/* Legs */}
      <View
        style={{
          position: 'absolute',
          top: 2 * u + head + 2 * u + torsoH + 2 * u,
          left: (stageW - hipW) / 2 + u,
          width: legW,
          height: a.bottom === 0 ? legH * 0.55 : legH,
          backgroundColor: a.bottom === 0 ? skin : bottomColor,
          borderRadius: 1,
          zIndex: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 2 * u + head + 2 * u + torsoH + 2 * u,
          right: (stageW - hipW) / 2 + u,
          width: legW,
          height: a.bottom === 0 ? legH * 0.55 : legH,
          backgroundColor: a.bottom === 0 ? skin : bottomColor,
          borderRadius: 1,
          zIndex: 1,
        }}
      />

      {/* Shorts lower band when shorts */}
      {a.bottom === 0 && (
        <>
          <View
            style={{
              position: 'absolute',
              top: 2 * u + head + 2 * u + torsoH + 2 * u,
              left: (stageW - hipW) / 2 + u,
              width: legW,
              height: legH * 0.35,
              backgroundColor: bottomColor,
              zIndex: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 2 * u + head + 2 * u + torsoH + 2 * u,
              right: (stageW - hipW) / 2 + u,
              width: legW,
              height: legH * 0.35,
              backgroundColor: bottomColor,
              zIndex: 2,
            }}
          />
        </>
      )}

      {/* Shoes */}
      <View
        style={{
          position: 'absolute',
          bottom: u,
          left: (stageW - hipW) / 2 + u * 0.5,
          width: legW * 1.15,
          height: 2.5 * u,
          backgroundColor: '#1a1a1a',
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: u,
          right: (stageW - hipW) / 2 + u * 0.5,
          width: legW * 1.15,
          height: 2.5 * u,
          backgroundColor: '#1a1a1a',
          borderRadius: 1,
        }}
      />
    </View>
  );
}

function poseArm(
  side: 'left' | 'right',
  pose: AvatarPose,
  armW: number,
  armH: number,
  u: number
): ViewStyle {
  if (pose === 'idle') return {};
  if (pose === 'curl' && side === 'right') {
    return { transform: [{ rotate: '-55deg' }], height: armH * 0.85 };
  }
  if (pose === 'curl' && side === 'left') {
    return { transform: [{ rotate: '10deg' }] };
  }
  if (pose === 'eat' && side === 'left') {
    return {
      transform: [{ rotate: '-40deg' }],
      height: armH * 0.9,
      top: undefined,
    };
  }
  if (pose === 'think' && side === 'right') {
    return {
      transform: [{ rotate: '-75deg' }],
      height: armH * 0.95,
      marginTop: -4 * u,
    };
  }
  return {};
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
