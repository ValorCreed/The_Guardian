import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '../services/api';
import { calculateSecurityReport, SecurityReport } from '../utils/securityScore';

const emptyReport: SecurityReport = {
  score: 0,
  totalPasswords: 0,
  weakCount: 0,
  mediumCount: 0,
  strongCount: 0,
//   reusedCount: 0,
//   missingInfoCount: 0,
  issues: [],
};

export const useSecurityScore = () => {
  const [report, setReport] = useState<SecurityReport>(emptyReport);
  const [loading, setLoading] = useState(false);

  const loadSecurityScore = async () => {
    try {
      setLoading(true);
      const passwords = await api.getVaultItems();
      setReport(calculateSecurityReport(passwords));
    } catch (error) {
      console.log('SECURITY SCORE ERROR:', error);
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSecurityScore();
    }, [])
  );

  return { report, loading, reload: loadSecurityScore };
};
