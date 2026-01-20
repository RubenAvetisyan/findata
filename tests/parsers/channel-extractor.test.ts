import { describe, it, expect } from 'vitest';
import { extractChannel, extractBankReference, extractChannelAndReference } from '../../src/parsers/boa/channel-extractor.js';

describe('Channel Extractor', () => {
  describe('extractChannel', () => {
    it('should detect Online Banking transfer from SAV', () => {
      const desc = 'Online Banking transfer from SAV ...3456 Confirmation# 1234567890';
      const result = extractChannel(desc);
      expect(result.type).toBe('ONLINE_BANKING_TRANSFER');
      expect(result.subtype).toBe('transfer_from_sav');
    });

    it('should detect Online Banking transfer to SAV', () => {
      const desc = 'Online Banking transfer to SAV ...3456 Confirmation# 1234567890';
      const result = extractChannel(desc);
      expect(result.type).toBe('ONLINE_BANKING_TRANSFER');
      expect(result.subtype).toBe('transfer_to_sav');
    });

    it('should detect ATM deposit', () => {
      const desc = 'BKOFAMERICA ATM #000009733 DEPOSIT 01/05 123 MAIN ST ANYTOWN CA';
      const result = extractChannel(desc);
      expect(result.type).toBe('ATM_DEPOSIT');
    });

    it('should detect ATM withdrawal', () => {
      const desc = 'BKOFAMERICA ATM #000009733 WITHDRWL 01/05 123 MAIN ST ANYTOWN CA';
      const result = extractChannel(desc);
      expect(result.type).toBe('ATM_WITHDRAWAL');
    });

    it('should detect Zelle payment from', () => {
      const desc = 'Zelle payment from JOHN DOE Conf# T0ZDL3WND';
      const result = extractChannel(desc);
      expect(result.type).toBe('ZELLE');
      expect(result.subtype).toContain('from');
    });

    it('should detect Zelle payment to', () => {
      const desc = 'Zelle payment to JANE DOE Conf# ABC123XYZ';
      const result = extractChannel(desc);
      expect(result.type).toBe('ZELLE');
    });

    it('should detect CHECKCARD transactions', () => {
      const desc = 'CHECKCARD 0105 STARBUCKS STORE 12345 SEATTLE WA 24801975260482319110911';
      const result = extractChannel(desc);
      expect(result.type).toBe('CHECKCARD');
    });

    it('should detect CHECK from section', () => {
      const desc = '1234';
      const result = extractChannel(desc, 'checks');
      expect(result.type).toBe('CHECK');
    });

    it('should detect FEE from section', () => {
      const desc = 'Monthly Maintenance Fee';
      const result = extractChannel(desc, 'service_fees');
      expect(result.type).toBe('FEE');
    });

    it('should detect FEE from description', () => {
      const desc = 'SERVICE FEE';
      const result = extractChannel(desc);
      expect(result.type).toBe('FEE');
    });

    it('should return OTHER for unknown patterns', () => {
      const desc = 'SOME RANDOM MERCHANT PURCHASE';
      const result = extractChannel(desc);
      expect(result.type).toBe('OTHER');
    });
  });

  describe('extractBankReference', () => {
    it('should extract cardTransactionTraceNumber from CHECKCARD', () => {
      const desc = 'CHECKCARD 0105 STARBUCKS STORE 12345 SEATTLE WA 24801975260482319110911';
      const result = extractBankReference(desc, 'CHECKCARD');
      expect(result.cardTransactionTraceNumber).toBe('24801975260482319110911');
    });

    it('should NOT extract trace number for non-CHECKCARD', () => {
      const desc = 'SOME TRANSACTION 24801975260482319110911';
      const result = extractBankReference(desc, 'OTHER');
      expect(result.cardTransactionTraceNumber).toBeNull();
    });

    it('should extract confirmationNumber from Online Banking transfer', () => {
      const desc = 'Online Banking transfer from SAV ...3456 Confirmation# 1234567890';
      const result = extractBankReference(desc, 'ONLINE_BANKING_TRANSFER');
      expect(result.confirmationNumber).toBe('1234567890');
    });

    it('should extract zelleConfirmation from Zelle', () => {
      const desc = 'Zelle payment from JOHN DOE Conf# T0ZDL3WND';
      const result = extractBankReference(desc, 'ZELLE');
      expect(result.zelleConfirmation).toBe('T0ZDL3WND');
    });

    it('should extract atmId from ATM transactions', () => {
      const desc = 'BKOFAMERICA ATM #000009733 DEPOSIT 01/05';
      const result = extractBankReference(desc, 'ATM_DEPOSIT');
      expect(result.atmId).toBe('000009733');
    });

    it('should extract checkNumber from CHECK', () => {
      const desc = 'Check #1234';
      const result = extractBankReference(desc, 'CHECK');
      expect(result.checkNumber).toBe('1234');
    });
  });

  describe('extractChannelAndReference (combined)', () => {
    it('should extract both channel and reference for CHECKCARD', () => {
      const desc = 'CHECKCARD 0105 GLENROSE LIQUOR GLENDALE CA 24801975260482319110911';
      const { channel, bankReference } = extractChannelAndReference(desc);
      
      expect(channel.type).toBe('CHECKCARD');
      expect(bankReference.cardTransactionTraceNumber).toBe('24801975260482319110911');
    });

    it('should extract both for Online Banking transfer', () => {
      const desc = 'Online Banking transfer from SAV ...3456 Confirmation# 9876543210';
      const { channel, bankReference } = extractChannelAndReference(desc);
      
      expect(channel.type).toBe('ONLINE_BANKING_TRANSFER');
      expect(channel.subtype).toBe('transfer_from_sav');
      expect(bankReference.confirmationNumber).toBe('9876543210');
    });

    it('should extract both for Zelle', () => {
      const desc = 'Zelle payment from JOHN DOE Conf# ABCD1234';
      const { channel, bankReference } = extractChannelAndReference(desc);
      
      expect(channel.type).toBe('ZELLE');
      expect(bankReference.zelleConfirmation).toBe('ABCD1234');
    });

    it('should extract both for ATM deposit', () => {
      const desc = 'BKOFAMERICA ATM #000012345 DEPOSIT 01/15 MAIN ST ANYTOWN CA';
      const { channel, bankReference } = extractChannelAndReference(desc);
      
      expect(channel.type).toBe('ATM_DEPOSIT');
      expect(bankReference.atmId).toBe('000012345');
    });
  });
});

describe('Wrapped line handling', () => {
  it('should handle CHECKCARD with city/state on continuation', () => {
    const desc = 'CHECKCARD 0105 GLENROSE LIQUOR GLENDALE CA 24801975260482319110911';
    const { channel, bankReference } = extractChannelAndReference(desc);
    
    expect(channel.type).toBe('CHECKCARD');
    expect(bankReference.cardTransactionTraceNumber).toBe('24801975260482319110911');
  });
});
