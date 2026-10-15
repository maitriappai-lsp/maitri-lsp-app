import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import MastersScreen from '../screens/admin/MastersScreen';
import ScheduleScreen from '../screens/admin/ScheduleScreen';
import OverrideScreen from '../screens/admin/OverrideScreen';
import ContentAdminScreen from '../screens/admin/ContentAdminScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import SearchScreen from '../screens/admin/SearchScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Masters: 'people-outline',
  Schedule: 'calendar-outline',
  Override: 'hammer-outline',
  Content: 'document-text-outline',
  Dashboard: 'stats-chart-outline',
  Search: 'search-outline',
};

// Bottom nav order per spec: Masters · Schedule · Override · Content · Dashboard · Search
// (Admin also has everything a Facilitator has -- see App.js's RootNavigator
// for the "Switch to facilitator view" entry point into FacilitatorTabs.)
export default function AdminTabs() {
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
      <Tab.Screen name="Masters" component={MastersScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Override" component={OverrideScreen} />
      <Tab.Screen name="Content" component={ContentAdminScreen} />
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}
