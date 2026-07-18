import { useState, useCallback, useRef, useEffect } from 'react';
import { patientApi } from '@/services/api';
import { matchPinyin, getInputType } from '@/utils/pinyin';

interface Patient {
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

  // 加载最近就诊患者
  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      // 调用专门的 recent API
      const response = await patientApi.getRecent(10);
      const items = response.data || [];
      setRecentPatients(items);
    } catch (error) {
      console.error('Failed to load recent patients:', error);
      // 如果 recent API 失败，回退到 getAll
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

  // 搜索患者
  const search = useCallback((query: string) => {
    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 如果查询为空，清空结果
    if (!query.trim()) {
      setPatients([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 防抖处理
    debounceTimerRef.current = setTimeout(async () => {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const inputType = getInputType(query);
        
        // 调用后端搜索 API
        const response = await patientApi.search(query, limit);
        let results = response.data || [];

        // 前端二次处理：拼音匹配增强
        if (inputType === 'pinyin') {
          results = results.filter((patient: Patient) => 
            matchPinyin(patient.name, query)
          );
        }

        // 限制结果数量
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

  // 组件卸载时清理
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
