import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4A9B6E',
        tabBarInactiveTintColor: '#8B95A5',
        tabBarStyle: {
          backgroundColor: '#2A3038',
          borderTopWidth: 1,
          borderTopColor: '#3A424D',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: '#1E2328',
          borderBottomWidth: 1,
          borderBottomColor: '#3A424D',
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          color: '#E8ECF1',
          fontSize: 14,
          fontWeight: 'bold',
          letterSpacing: 1.2,
        },
        headerTintColor: '#E8ECF1',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'SECURE CHATS',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="peers"
        options={{
          title: 'MESH PEERS',
          tabBarLabel: 'Peers',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          title: 'ROUTING LOGS',
          tabBarLabel: 'Logs',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="terminal" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
