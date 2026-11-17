import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { supabase } from '../../utils/supabase';

type Lesson = {
  id: string;
  module: string;
  title: string;
  durationMin: number;
  exerciseType: string;
};

type VaultItem = {
  id: string;
  code: string;
  transcript: string;
  order: number;
};

export default function LessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchLessonDetails() {
      if (!id) {
        setLoadError('No lesson ID was provided.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      setLesson(null);
      setVaultItems([]);

      try {
        const { data, error } = await supabase
          .from('Lesson')
          .select(`
            *,
            ShadowingVault (*)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;

        if (active) {
          setLesson(data);
          setVaultItems(
            [...(data?.ShadowingVault || [])].sort(
              (a: VaultItem, b: VaultItem) => a.order - b.order
            )
          );
        }
      } catch (error) {
        console.error('Error fetching lesson details:', error);
        if (active) {
          setLoadError('Could not load the lesson. Check the console for details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchLessonDetails();

    return () => {
      active = false;
      Speech.stop();
    };
  }, [id]);

  async function handleSpeak(item: VaultItem) {
    // Speak the first line, without phonetics between slashes.
    const textToSpeak = typeof item.transcript === 'string'
      ? item.transcript.split('\n')[0].replace(/\s*\/[^/]+\/.*$/, '').trim()
      : '';

    if (!textToSpeak) {
      Alert.alert('No text', 'There is no text to speak for this item.');
      return;
    }

    try {
      if (activeId === item.id) {
        await Speech.stop();
        setActiveId(null);
        return;
      }

      await Speech.stop();
      setActiveId(item.id);

      Speech.speak(textToSpeak, {
        language: 'en-GB', // Switches TTS engine to British English
        rate: 0.9,
        onDone: () => setActiveId(null),
        onStopped: () => setActiveId(null),
        onError: () => setActiveId(null),
      });
    } catch (error) {
      console.error('Could not start speech:', error);
      setActiveId(null);
      Alert.alert('Speech error', 'Could not speak this item.');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading lesson and Shadowing Vault...</Text>
      </View>
    );
  }

  if (loadError || !lesson) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Lesson' }} />
        <Text style={styles.emptyText}>{loadError || 'Lesson not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: lesson.module, headerBackTitle: 'Lessons' }} />

      <View style={styles.headerCard}>
        <Text style={styles.moduleBadge}>
          {lesson.module} • {lesson.durationMin} mins
        </Text>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.type}>Focus: {lesson.exerciseType}</Text>
      </View>

      <Text style={styles.sectionHeader}>Shadowing Vault ({vaultItems.length})</Text>

      <FlatList
        data={vaultItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No shadowing items linked to this lesson yet.
          </Text>
        }
        renderItem={({ item }) => {
          const isPlaying = activeId === item.id;

          return (
            <TouchableOpacity
              style={[styles.card, isPlaying && styles.cardActive]}
              onPress={() => handleSpeak(item)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${isPlaying ? 'Stop' : 'Speak'} ${item.code}`}
            >
              <View style={styles.row}>
                <View style={[styles.playButton, isPlaying && styles.playButtonActive]}>
                  <Text style={[styles.playIcon, isPlaying && styles.playIconActive]}>
                    {isPlaying ? '■' : '▶'}
                  </Text>
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.itemCode}>{item.code}</Text>
                  <Text style={styles.targetText}>{item.transcript}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 20 },
  loadingText: { marginTop: 10, color: '#666' },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center', marginTop: 20 },
  headerCard: { backgroundColor: '#fff', padding: 18, borderRadius: 14, marginBottom: 20, elevation: 2 },
  moduleBadge: { fontSize: 12, fontWeight: '700', color: '#007AFF', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  type: { fontSize: 14, color: '#666' },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'transparent', elevation: 1 },
  cardActive: { borderColor: '#007AFF', backgroundColor: '#f0f7ff' },
  row: { flexDirection: 'row', alignItems: 'center' },
  playButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f2ff', justifyContent: 'center', alignItems: 'center' },
  playButtonActive: { backgroundColor: '#007AFF' },
  playIcon: { fontSize: 14, color: '#007AFF', fontWeight: 'bold' },
  playIconActive: { color: '#fff' },
  textContainer: { flex: 1, marginLeft: 14 },
  itemCode: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 4 },
  targetText: { fontSize: 16, color: '#111' },
});
