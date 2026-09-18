# UI Redesign QA Checklist

## Design System
- [x] Color tokens with semantic naming (primary, surface, text, status)
- [x] Typography scale (display, heading1/2/3, body, label, caption)
- [x] Spacing scale based on 4px grid
- [x] Border radius tokens (sm/md/lg/xl/full)
- [x] Shadow/elevation tokens for iOS + Android
- [x] All tokens exported from single `design-system/` barrel

## Icon System
- [x] `react-native-vector-icons` installed
- [x] Android `fonts.gradle` configured
- [x] `@types/react-native-vector-icons` installed
- [x] `Icon` component with semantic name mapping
- [x] Added 60+ semantic icon names

## Components
- [x] `Button` — variants: primary/secondary/outline/ghost/danger, sizes: sm/md/lg
- [x] `Card` — variants: default/muted
- [x] `Input` — with label, icon, error support
- [x] `Badge` — success/warning/error/info/default
- [x] `StatusMessage` — with icon prefix
- [x] `SectionHeader` — title + subtitle + action slot
- [x] `ToggleGroup` — generic type-safe toggle
- [x] `EmptyState` — icon + title + message + action
- [x] `Divider` — simple horizontal rule
- [x] `ScreenContainer` — SafeAreaView + optional scroll/keyboard avoid
- [x] `ScreenHeader` — back button + title + subtitle + action
- [x] `LoadingOverlay` — centered spinner
- [x] `ListItem` — icon + title + subtitle + chevron

## Emoji Removal
- [x] PortalScreen: `👤` → Icon(person), `⚙️` → Icon(admin), `→` → Icon(chevron-right)
- [x] AutoConfigScreen: `📷` → text "Mở camera quét QR", `✓` → removed from text
- [x] FaceCaptureCamera: `🚫` → Icon(camera)
- [x] DatePickerField: `▾` → Icon(chevron-down), `‹` `›` → Icon(chevron-left/right)
- [x] AdminWorkspaceScreen: `📱` removed, `📋` removed, `✓` `⚠` removed, `NO IMG` → Icon(person-outline)
- [x] LoadingScreen: redesigned with Icon(face-recognition)

## Screens Refactored
- [x] PortalScreen — full rewrite with new design tokens + icons
- [x] EmployeeLoginScreen — full rewrite with hero icon, consistent form
- [x] AdminLoginScreen — full rewrite with toggle group, checkbox icon
- [x] AdminWorkspaceScreen — module box uses Card, colors replaced, emoji removed
- [x] EmployeeAttendanceScreen — "Den ngay" → "Đến ngày"
- [x] LoadingScreen — full rewrite with icon + spinner
- [x] DatePickerField — special chars replaced with icons

## Vietnamese Typography Fixes
- [x] "Tu ngay" → "Từ ngày" (AdminWorkspaceScreen)
- [x] "Den ngay" → "Đến ngày" (AdminWorkspaceScreen, EmployeeAttendanceScreen)
- [x] "Lua chon he thong" → "Lựa chọn hệ thống" (ConnectionConfigScreen)
- [x] "Quay lai" → "Quay lại" (ConnectionConfigScreen)
- [x] "ChamCong Mobile Native" → "Chấm công Mobile" (ConnectionConfigScreen)

## Hardcoded Color Removal
- [x] All `#eff6ff` → `colors.infoBg`
- [x] All `#ecfdf5` → `colors.successBg`
- [x] All `#fef9c3` → `colors.warningBg`
- [x] All `#fee2e2` → `colors.dangerBg`
- [x] All `#f8fafc` → `colors.cardMuted`
- [x] All `#fffbeb` → `colors.warningBg`
- [x] All `#e0f2fe` → `colors.infoBg`
- [x] All `#fef2f2` → `colors.dangerBg`

## Cleanup
- [x] Removed unused `HomeScreen.tsx`
- [x] Old `theme.ts` now re-exports from `design-system/`
- [x] Old `designSystem.ts` now re-exports with backward compat

## Build Verification
- Run `npx tsc --noEmit` after all changes
- Run `npx react-native run-android` to verify runtime
- Verify all screens render without JS errors
- Verify icons load correctly on device

## Items Requiring Manual Verification
1. Android build: fonts.gradle runs successfully
2. iOS build: add pod 'RNVectorIcons' if needed
3. Camera screens: FaceAttendancePanel + FaceCaptureCamera still functional
4. Employee image placeholders display icons correctly
5. All navigation flows (Login → Workspace → Modules) still work
