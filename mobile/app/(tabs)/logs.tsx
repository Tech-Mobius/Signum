import React from 'react';
import { StyleSheet, Text, View, FlatList } from 'react-native';
import { useSignal } from '../../src/context/SignalContext';

export default function LogsTab() {
  const { debugLogs } = useSignal();

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'webrtc':   return '#5B8DB8'; 
      case 'crypto':   return '#E5A83B'; 
      case 'identity': return '#4A9B6E'; 
      case 'router':   return '#E5A83B'; 
      case 'error':    return '#C45B5B'; 
      default:         return '#8B95A5'; 
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>DIAGNOSTIC EVENTS LOG</Text>
        <Text style={styles.count}>{debugLogs.length} EVENTS</Text>
      </View>
      <FlatList
        data={debugLogs}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No diagnostic events recorded yet.</Text>
        }
        renderItem={({ item }) => {
          const time = new Date(item.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          });
          const categoryColor = getCategoryColor(item.category);

          return (
            <View style={styles.logRow}>
              <Text style={styles.time}>{time}</Text>
              <Text style={[styles.category, { color: categoryColor }]}>
                [{item.category.toUpperCase()}]
              </Text>
              <Text style={styles.message}>{item.message}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2328',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#8B95A5',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  count: {
    color: '#8B95A5',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  listContainer: {
    padding: 16,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
    gap: 8,
  },
  time: {
    color: 'rgba(139, 149, 165, 0.6)',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  category: {
    fontWeight: 'bold',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  message: {
    color: '#E8ECF1',
    flex: 1,
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 15,
  },
  emptyText: {
    color: '#8B95A5',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
  },
});
