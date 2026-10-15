import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import AttendanceScreen from '../screens/facilitator/AttendanceScreen';
import SessionsScreen from '../screens/facilitator/SessionsScreen';
import UploadsScreen from '../screens/facilitator/UploadsScreen';
import DashboardScreen from '../screens/facilitator/DashboardScreen';
import ContentScreen from '../screens/facilitator/ContentScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Attendance: 'location-outline',
  Sessions: 'clipboard-outline',
  Uploads: 'cloud-upload-outline',
  Dashboard: 'stats-chart-outline',
  Content: 'book-outline',
};

// Bottom nav order per spec: Attendance · Sessions (PSR) · Uploads · Dashboard · Content
export default function FacilitatorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        // Without a tabBarIcon, React Navigation draws a placeholder box.
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Sessions (PSR)' }} />
      <Tab.Screen name="Uploads" component={UploadsScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Content" component={ContentScreen} />
    </Tab.Navigator>
  );
}
