package com.wake2win.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.wake2win.app.alarm.NativeAlarmPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the app-local NativeAlarm plugin before the Capacitor bridge
        // initialises so the JS `registerPlugin('NativeAlarm')` proxy is wired.
        registerPlugin(NativeAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
