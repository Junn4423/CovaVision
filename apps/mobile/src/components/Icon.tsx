/**
 * Icon component - thin wrapper around MaterialCommunityIcons.
 *
 * All icons are named semantically. Add new icons to the ICONS map.
 * Usage: <Icon name="person" size={24} color={colors.primary} />
 */

import React from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {colors} from '../design-system';

// ── Semantic → MaterialCommunityIcons name mapping ──
export const ICONS = {
  // Navigation
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  chevron_right: 'chevron-right',
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  arrow_forward: 'arrow-right',
  arrow_back: 'arrow-left',
  back: 'arrow-left',

  // Actions
  apps: 'apps',
  close: 'close',
  check: 'check',
  plus: 'plus',
  edit: 'pencil',
  delete: 'delete-outline',
  search: 'magnify',
  refresh: 'refresh',
  sync: 'sync',
  filter: 'filter-variant',
  tune: 'tune',
  download: 'download',
  cloud_download: 'cloud-download',
  cloud_upload: 'cloud-upload',
  upload: 'upload',
  delete_forever: 'delete-forever',
  qrcode: 'qrcode-scan',
  bolt: 'flash',
  compare: 'file-compare',
  check_box: 'checkbox-marked',
  check_box_outline_blank: 'checkbox-blank-outline',
  'open-in-new': 'open-in-new',
  cart: 'cart',
  trending_up: 'trending-up',
  notifications: 'bell-outline',
  save: 'content-save',
  key: 'key-variant',
  vpn_key: 'key-variant',
  lock_open: 'lock-open-variant',
  camera_alt: 'camera',
  today: 'calendar-today',
  storage: 'database',
  visibility: 'eye',
  'videocam-off': 'video-off',
  videocam_off: 'video-off',

  // Audio & Speaker
  'volume-up': 'volume-high',
  'volume-down': 'volume-medium',
  'volume-mute': 'volume-low',
  'volume-off': 'volume-off',
  'volume-high': 'volume-high',
  'volume-medium': 'volume-medium',
  'volume-low': 'volume-low',
  speaker: 'volume-high',
  play: 'play',
  'play-arrow': 'play',
  pause: 'pause',
  stop: 'stop',
  'access-time': 'clock-outline',
  add: 'plus',
  remove: 'minus',
  minus: 'minus',
  'check-circle': 'check-circle',

  // People
  person: 'account',
  'person-outline': 'account-outline',
  person_add: 'account-plus',
  people: 'account-group',
  'people-outline': 'account-group-outline',
  admin: 'shield-account',
  account_circle: 'account-circle',

  // System
  settings: 'cog',
  'settings-outline': 'cog-outline',
  server: 'server',
  database: 'database',
  wifi: 'wifi',
  wifi_off: 'wifi-off',
  cloud_off: 'cloud-off-outline',
  lan: 'lan-connect',
  dns: 'dns',
  sd_card: 'sd',

  // Camera & face
  camera: 'camera',
  'camera-outline': 'camera-outline',
  camera_front: 'camera-front',
  videocam: 'video',
  'face-recognition': 'face-recognition',
  face_recognition: 'face-recognition',
  face: 'face-man',
  'face-outline': 'face-man-outline',

  // Status
  success: 'check-circle',
  check_circle: 'check-circle',
  warning: 'alert',
  error: 'alert-circle',
  info: 'information',
  priority_high: 'alert-circle',
  sync_problem: 'sync-alert',

  // Content
  clock: 'clock-outline',
  schedule: 'clock-outline',
  timer: 'timer-outline',
  calendar: 'calendar',
  calendar_today: 'calendar-today',
  document: 'file-document-outline',
  picture_as_pdf: 'file-pdf-box',
  table_chart: 'file-excel-box',
  folder: 'folder',
  report: 'chart-bar',
  analytics: 'chart-line',
  dashboard: 'view-dashboard',
  history: 'history',

  // UI elements
  dots: 'dots-horizontal',
  'more-vertical': 'dots-vertical',
  menu: 'menu',
  logout: 'logout',
  login: 'login',
  lock: 'lock',
  'lock-outline': 'lock-outline',
  eye: 'eye',
  'eye-off': 'eye-off',
  home: 'home',
  'home-outline': 'home-outline',

  // Office
  briefcase: 'briefcase-outline',
  'office-building': 'office-building',
  badge: 'badge-account',
  fingerprint: 'fingerprint',

  // Misc
  star: 'star',
  'star-outline': 'star-outline',
  heart: 'heart',
  link: 'link-variant',
  copy: 'content-copy',
  mail: 'email-outline',
  phone: 'phone',
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
}

export function Icon({
  name,
  size = 24,
  color = colors.textPrimary,
  style,
}: IconProps) {
  const iconName = ICONS[name] || 'help-circle-outline';
  return (
    <MaterialCommunityIcons
      name={iconName}
      size={size}
      color={color}
      style={style}
    />
  );
}
