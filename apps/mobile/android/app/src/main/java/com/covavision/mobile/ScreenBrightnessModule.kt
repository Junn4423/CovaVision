package com.covavision.mobile

import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class ScreenBrightnessModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ScreenBrightness"

  @ReactMethod
  fun setTemporaryBrightness(level: Double, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val safeLevel = level.toFloat().coerceIn(0.05f, 1.0f)
        val layoutParams = activity.window.attributes
        layoutParams.screenBrightness = safeLevel
        activity.window.attributes = layoutParams
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("E_SCREEN_BRIGHTNESS", error)
      }
    }
  }

  @ReactMethod
  fun restoreSystemBrightness(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val layoutParams = activity.window.attributes
        layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        activity.window.attributes = layoutParams
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("E_SCREEN_BRIGHTNESS_RESTORE", error)
      }
    }
  }
}
