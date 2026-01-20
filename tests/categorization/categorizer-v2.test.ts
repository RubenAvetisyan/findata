import { describe, it, expect } from 'vitest';
import { 
  categorizeTransaction, 
  CATEGORY_RULES_V2,
  DEFAULT_CATEGORY,
  DEFAULT_CONFIDENCE,
} from '../../src/categorization/categorizer-v2.js';

describe('Categorizer V2', () => {
  describe('categorizeTransaction', () => {
    describe('Income', () => {
      it('should categorize payroll as Income/Salary with high confidence', () => {
        const result = categorizeTransaction('PAYROLL DIRECT DEP ACME CORP');
        expect(result.category).toBe('Income');
        expect(result.subcategory).toBe('Salary');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should categorize Zelle from as Transfer/Zelle', () => {
        const result = categorizeTransaction('Zelle payment from JOHN DOE Conf# ABC123', 'ZELLE');
        expect(result.category).toBe('Transfer');
        expect(result.subcategory).toBe('Zelle');
      });
    });

    describe('Food & Dining', () => {
      it('should categorize Starbucks as Food & Dining/Restaurants', () => {
        const result = categorizeTransaction('STARBUCKS STORE 12345 SEATTLE WA');
        expect(result.category).toBe('Food & Dining');
        expect(result.subcategory).toBe('Restaurants');
      });

      it('should categorize DoorDash as Food & Dining/Food Delivery', () => {
        const result = categorizeTransaction('DOORDASH*ORDER 123456');
        expect(result.category).toBe('Food & Dining');
        expect(result.subcategory).toBe('Food Delivery');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should categorize grocery stores correctly', () => {
        const result = categorizeTransaction('TRADER JOE\'S #123 LOS ANGELES CA');
        expect(result.category).toBe('Food & Dining');
        expect(result.subcategory).toBe('Groceries');
      });
    });

    describe('Transportation', () => {
      it('should categorize Uber as Transportation/Rideshare', () => {
        const result = categorizeTransaction('UBER *TRIP ABC123');
        expect(result.category).toBe('Transportation');
        expect(result.subcategory).toBe('Rideshare');
      });

      it('should NOT categorize Uber Eats as Transportation', () => {
        const result = categorizeTransaction('UBER EATS ORDER 123');
        expect(result.category).toBe('Food & Dining');
        expect(result.subcategory).toBe('Food Delivery');
      });

      it('should categorize gas stations correctly', () => {
        const result = categorizeTransaction('CHEVRON 12345 LOS ANGELES CA');
        expect(result.category).toBe('Transportation');
        expect(result.subcategory).toBe('Gas');
      });
    });

    describe('Financial', () => {
      it('should categorize ATM withdrawal with channel type', () => {
        const result = categorizeTransaction('BKOFAMERICA ATM WITHDRWL', 'ATM_WITHDRAWAL');
        expect(result.category).toBe('Financial');
        expect(result.subcategory).toBe('ATM');
      });

      it('should categorize service fees', () => {
        const result = categorizeTransaction('MONTHLY MAINTENANCE FEE', 'FEE');
        expect(result.category).toBe('Fees');
        expect(result.subcategory).toBe('Bank');
      });

      it('should categorize Zelle to as Transfer/Zelle', () => {
        const result = categorizeTransaction('Zelle payment to JANE DOE Conf# XYZ789', 'ZELLE');
        expect(result.category).toBe('Transfer');
        expect(result.subcategory).toBe('Zelle');
      });
    });

    describe('Shopping', () => {
      it('should categorize Amazon as Shopping/Online', () => {
        const result = categorizeTransaction('AMZN.COM*ABC123 SEATTLE WA');
        expect(result.category).toBe('Shopping');
        expect(result.subcategory).toBe('Online');
      });

      it('should categorize Target as Shopping/General Merchandise', () => {
        const result = categorizeTransaction('TARGET 00012345 LOS ANGELES CA');
        expect(result.category).toBe('Shopping');
        expect(result.subcategory).toBe('General Merchandise');
      });
    });

    describe('Entertainment', () => {
      it('should categorize Netflix as Entertainment/Streaming', () => {
        const result = categorizeTransaction('NETFLIX.COM 123456789');
        expect(result.category).toBe('Entertainment');
        expect(result.subcategory).toBe('Streaming');
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      });

      it('should categorize gym as Entertainment/Fitness', () => {
        const result = categorizeTransaction('PLANET FITNESS 12345');
        expect(result.category).toBe('Entertainment');
        expect(result.subcategory).toBe('Fitness');
      });
    });

    describe('Uncategorized', () => {
      it('should return Uncategorized with 0.5 confidence for unknown merchants', () => {
        const result = categorizeTransaction('RANDOM UNKNOWN MERCHANT XYZ123');
        expect(result.category).toBe('Uncategorized');
        expect(result.confidence).toBe(0.5);
        expect(result.ruleId).toBeNull();
      });
    });

    describe('Confidence tiers', () => {
      it('should have HIGH confidence (0.95) for exact matches', () => {
        const result = categorizeTransaction('PAYROLL DIRECT DEP');
        expect(result.confidence).toBe(0.95);
      });

      it('should have MEDIUM_HIGH confidence (0.85) for keyword matches', () => {
        const result = categorizeTransaction('CHEVRON GAS STATION');
        expect(result.confidence).toBe(0.85);
      });

      it('should have MEDIUM confidence (0.75) for weaker matches', () => {
        const result = categorizeTransaction('COSTCO WHOLESALE');
        expect(result.confidence).toBe(0.75);
      });

      it('should have LOW confidence (0.5) for uncategorized', () => {
        const result = categorizeTransaction('COMPLETELY UNKNOWN');
        expect(result.confidence).toBe(0.5);
      });
    });

    describe('Rule metadata', () => {
      it('should include ruleId when matched', () => {
        const result = categorizeTransaction('STARBUCKS COFFEE');
        expect(result.ruleId).toBeTruthy();
        expect(result.ruleId).toContain('food');
      });

      it('should include rationale when matched', () => {
        const result = categorizeTransaction('NETFLIX.COM');
        expect(result.rationale).toBeTruthy();
        expect(result.rationale).toContain('Matched rule');
      });
    });
  });

  describe('CATEGORY_RULES_V2', () => {
    it('should have rules sorted by priority', () => {
      for (let i = 1; i < CATEGORY_RULES_V2.length; i++) {
        const prev = CATEGORY_RULES_V2[i - 1];
        const curr = CATEGORY_RULES_V2[i];
        if (prev !== undefined && curr !== undefined) {
          expect(prev.priority).toBeLessThanOrEqual(curr.priority);
        }
      }
    });

    it('should have unique rule IDs', () => {
      const ids = CATEGORY_RULES_V2.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid categories for all rules', () => {
      const validCategories = [
        'Income', 'Housing', 'Utilities', 'Transportation', 'Food & Dining',
        'Shopping', 'Entertainment', 'Health', 'Financial', 'Transfer', 'Fees',
        'Travel', 'Education', 'Personal Care', 'Insurance', 'Taxes', 'Charity',
        'Pets', 'Childcare', 'Uncategorized',
      ];
      
      for (const rule of CATEGORY_RULES_V2) {
        expect(validCategories).toContain(rule.category);
      }
    });
  });

  describe('Does NOT use trace numbers for categorization', () => {
    it('should categorize based on merchant, not trace number', () => {
      const withTrace = 'CHECKCARD 0105 STARBUCKS STORE 12345 SEATTLE WA 24801975260482319110911';
      const withoutTrace = 'CHECKCARD 0105 STARBUCKS STORE 12345 SEATTLE WA';
      
      const resultWith = categorizeTransaction(withTrace);
      const resultWithout = categorizeTransaction(withoutTrace);
      
      expect(resultWith.category).toBe(resultWithout.category);
      expect(resultWith.subcategory).toBe(resultWithout.subcategory);
    });

    it('should not match on numeric-only patterns', () => {
      const result = categorizeTransaction('24801975260482319110911');
      expect(result.category).toBe('Uncategorized');
    });
  });
});
