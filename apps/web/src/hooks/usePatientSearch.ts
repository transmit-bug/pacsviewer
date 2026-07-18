import { useState, useCallback, useRef, useEffect } from 'react';
import { patientApi } from '@/services/api';
import { matchPinyin, getInputType } from '@/utils/pinyin';

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  lastStudy?: {
    id: string;
    studyDate: string;
    modality?: string;
  };
}

interface UsePatientSearchOptions {
  limit?: number;
  debounceMs?: number;
}

interface UsePatientSearchReturn {
  patients: Patient[];
  loading: boolean;
  search: (query: string) => void;
  loadRecent: () => Promise<void>;
  recentPatients: Patient[];
  recentLoading: boolean;
}

export function usePatientSearch(options: UsePatientSearchOptions = {}): UsePatientSearchReturn {
  const { limit = 20, debounceMs = 300 } = options;
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController>();

  // 加载最近就诊患者 - 按最近就诊日期排序
  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const response = await patientApi.getRecent(10);
      const items = response.data || [];
      setRecentPatients(items);
    } catch (error) {
      console.error('Failed to load recent patients:', error);
      try {
        const response = await patientApi.getAll({ page: 1, pageSize: 10 });
        const items = response.data?.items || response.data || [];
        setRecentPatients(items);
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError);
      }
    } finally {
      setRecentLoading(false);
    }
  }, []);

  // 搜索患者 - 按相关性排序（后端已处理）
  const search = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setPatients([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const inputType = getInputType(query);
        const response = await patientApi.search(query, limit);
        let results = response.data || [];

        // 拼音匹配增强
        if (inputType === 'pinyin') {
          results = results.filter((patient: Patient) => 
            matchPinyin(patient.name, query)
          );
        }

        results = results.slice(0, limit);
        setPatients(results);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Search failed:', error);
          setPatients([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);
  }, [limit, debounceMs]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    patients,
    loading,
    search,
    loadRecent,
    recentPatients,
    recentLoading,
  };
}
