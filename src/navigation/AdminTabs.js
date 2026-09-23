import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme';
import MastersScreen from '../screens/admin/MastersScreen';
import ScheduleScreen from '../screens/admin/ScheduleScreen';
import OverrideScreen from '../screens/admin/OverrideScreen';
import ContentAdminScreen from '../screens/admin/ContentAdminScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';

const Tab = createBottomTabNavigator();

// Bottom nav order per spec: Masters · Schedule · Override · Content · Dashboard
// (Admin also has everything a Facilitator has -- see App.js's RootNavigator
// for the "Switch to facilitator view" entry point into FacilitatorTabs.)
export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen name="Masters" component={MastersScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Override" component={OverrideScreen} />
      <Tab.Screen name="Content" component={ContentAdminScreen} />
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
    </Tab.Navigator>
  );
}
