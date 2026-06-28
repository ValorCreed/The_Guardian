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
  issues: [],
};

let lastReport: SecurityReport | null = null;
let lastLoadedAt = 0;
let inFlight: Promise<SecurityReport> | null = null;
const SECURITY_CACHE_MS = 15000;

async function loadReport() {
  const now = Date.now();

  if (lastReport && now - lastLoadedAt < SECURITY_CACHE_MS) {
    return lastReport;
  }

  if (inFlight) return inFlight;

  inFlight = api.getVaultItems()
    .then((passwords) => {
      const report = calculateSecurityReport(passwords);
      lastReport = report;
      lastLoadedAt = Date.now();
      return report;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export const useSecurityScore = () => {
  const [report, setReport] = useState<SecurityReport>(lastReport || emptyReport);
  const [loading, setLoading] = useState(false);

  const loadSecurityScore = async (force = false) => {
    try {
      setLoading(true);

      if (force) {
        lastReport = null;
        lastLoadedAt = 0;
        api.clearCache?.();
      }

      const calculated = await loadReport();
      setReport(calculated);
    } catch (error) {
      console.log('SECURITY SCORE ERROR:', error);
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSecurityScore(false);
    }, [])
  );

  return { report, loading, reload: () => loadSecurityScore(true) };
};
