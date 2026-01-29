# Implementation Plan: Translatron CLI

## Overview

This implementation plan builds the Translatron CLI from scratch as a TypeScript/Node.js application. The system follows a pipeline architecture with clear separation of concerns: extraction → normalization → change detection → translation planning → LLM processing → validation → atomic file operations.

## Tasks

- [ ] 1. Project Setup and Core Infrastructure
  - Initialize Node.js project with TypeScript configuration
  - Set up build tooling (tsup/esbuild), testing framework (vitest), and linting
  - Configure package.json with CLI entry point and dependencies
  - Create basic project structure (src/, tests/, etc.)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ]* 1.1 Write property test for project setup
  - **Property 9: CLI Command Behavior - Init**
  - **Validates: Requirements 8.2**

- [ ] 2. Configuration System
  - [ ] 2.1 Implement Zod configuration schema
    - Define TranslatronConfig interface with all provider types
    - Create validation schemas for extractors, providers, validation rules
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 2.2 Create configuration loader and validator
    - Implement config file discovery (translatron.config.ts)
    - Add configuration validation with detailed error reporting
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 2.3 Write property tests for configuration management
    - **Property 7: Configuration Management**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [ ] 3. SQLite Ledger and State Management
  - [ ] 3.1 Implement SQLite ledger schema
    - Create database schema with source_hashes, sync_status, run_history tables
    - Add proper indexes for performance
    - _Requirements: 9.1, 9.2_

  - [ ] 3.2 Build ledger operations interface
    - Implement CRUD operations with transaction support
    - Add change detection and status tracking methods
    - _Requirements: 9.3, 9.4, 9.5_

  - [ ]* 3.3 Write property tests for ledger state management
    - **Property 13: Ledger State Management**
    - **Validates: Requirements 2.4, 9.1, 9.2, 9.3, 9.4, 9.5**

- [ ] 4. Core Data Models and Pipeline
  - [ ] 4.1 Define core interfaces and types
    - Implement SourceUnit, TranslationPlan, TranslationBatch interfaces
    - Create Polars DataFrame schemas for pipeline processing
    - _Requirements: 1.1, 1.2_

  - [ ] 4.2 Implement source extraction pipeline
    - Create Extractor interface and basic JSON extractor
    - Build source unit normalization and hash computation
    - _Requirements: 1.1, 1.2_

  - [ ]* 4.3 Write property tests for source extraction
    - **Property 1: Source Extraction and Hash Consistency**
    - **Validates: Requirements 1.1, 1.2**

- [ ] 5. Translation Planning and Change Detection
  - [ ] 5.1 Implement translation planner
    - Build change detection logic using content hashes
    - Create translation plan generation with deduplication
    - _Requirements: 1.3, 2.1, 2.2, 2.3_

  - [ ] 5.2 Add incremental processing logic
    - Implement ledger comparison and delta calculation
    - Add manual override detection and protection
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3_

  - [ ]* 5.3 Write property tests for incremental processing
    - **Property 2: Incremental Processing Correctness**
    - **Validates: Requirements 1.3, 2.1, 2.2, 2.3, 2.5**

  - [ ]* 5.4 Write property tests for manual override protection
    - **Property 3: Manual Override Protection**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [ ] 6. LLM Provider Abstraction Layer
  - [ ] 6.1 Create provider interface and base implementation
    - Define LLMProvider interface with common methods
    - Implement provider registry and factory pattern
    - _Requirements: 4.1, 4.2_

  - [ ] 6.2 Implement OpenAI provider
    - Add OpenAI API integration with retry logic and rate limiting
    - Implement cost estimation and model fingerprinting
    - _Requirements: 1.4, 4.1, 4.2, 4.5_

  - [ ] 6.3 Implement Anthropic provider
    - Add Anthropic API integration with proper error handling
    - Ensure consistent interface with OpenAI provider
    - _Requirements: 1.4, 4.1, 4.2, 4.5_

  - [ ] 6.4 Implement local LLM provider (Ollama/Local)
    - Add support for local LLM endpoints with custom base URLs
    - Implement streaming support for real-time token monitoring
    - _Requirements: 1.4, 4.1, 4.2, 4.5_

  - [ ] 6.5 Add additional provider support (Groq, OpenRouter, Azure OpenAI)
    - Implement remaining provider types for maximum flexibility
    - Ensure consistent streaming and monitoring across all providers
    - _Requirements: 1.4, 4.1, 4.2, 4.5_

  - [ ] 6.6 Add provider fallback and switching logic
    - Implement fallback chain when primary provider fails
    - Add provider state tracking and audit logging
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ]* 6.7 Write property tests for provider abstraction
    - **Property 4: Provider Abstraction Integrity**
    - **Validates: Requirements 1.4, 4.1, 4.2, 4.3, 4.4, 4.5**

- [ ] 7. Translation Validation Pipeline
  - [ ] 7.1 Implement validation interface and pipeline
    - Create ValidationPipeline with multi-stage validation
    - Add structural validation using Zod schemas
    - _Requirements: 5.1, 5.2_

  - [ ] 7.2 Add placeholder and semantic validation
    - Implement placeholder preservation checking
    - Add semantic validation (length, leakage detection)
    - _Requirements: 5.2, 5.3_

  - [ ] 7.3 Build validation retry and error handling
    - Add retry logic for failed validations
    - Implement validation result aggregation and reporting
    - _Requirements: 5.4, 5.5_

  - [ ]* 7.4 Write property tests for validation pipeline
    - **Property 5: Translation Validation Pipeline**
    - **Validates: Requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5**

- [ ] 8. File System Operations
  - [ ] 8.1 Implement atomic file writer
    - Create AtomicWriter with temp file + rename pattern
    - Add file reading and merging capabilities
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 8.2 Build translation file management
    - Implement deep merging for preserving existing translations
    - Add transactional ledger updates on successful writes
    - _Requirements: 6.2, 6.4, 6.5_

  - [ ]* 8.3 Write property tests for atomic file operations
    - **Property 6: Atomic File Operations**
    - **Validates: Requirements 1.6, 6.1, 6.2, 6.3, 6.4, 6.5**

- [ ] 9. CLI Interface and Interactive Features
  - [ ] 9.1 Create CLI command parser and router
    - Implement command parsing with proper argument validation
    - Add help system and error handling
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 9.2 Implement progress monitoring and streaming
    - Add real-time progress percentage display during translation
    - Implement token consumption monitoring with verbose output
    - Add streaming support for LLM responses when verbose mode is enabled
    - _Requirements: 8.1, 10.2_

  - [ ] 9.3 Implement sync command with interactive features
    - Build main translation processing workflow
    - Integrate progress monitoring and token streaming
    - Add interactive progress bars and status updates
    - _Requirements: 8.1_

  - [ ] 9.4 Implement init command
    - Create configuration scaffolding and directory setup
    - Generate sample configuration files
    - _Requirements: 8.2_

  - [ ] 9.5 Implement status and check commands
    - Add coverage statistics and system state reporting
    - Implement validation-only mode for check command
    - _Requirements: 8.3, 8.4_

  - [ ]* 9.6 Write property tests for CLI commands
    - **Property 8: CLI Command Behavior - Sync**
    - **Property 10: CLI Command Behavior - Status**
    - **Property 11: CLI Command Behavior - Check**
    - **Property 12: CLI Exit Codes**
    - **Validates: Requirements 8.1, 8.3, 8.4, 8.5**

- [ ] 10. Audit and Reporting System
  - [ ] 10.1 Implement run reporting and statistics
    - Create comprehensive run reports with translation statistics
    - Add token usage tracking and cost estimation
    - _Requirements: 10.1, 10.2_

  - [ ] 10.2 Build audit trail and history tracking
    - Implement model fingerprint and prompt version recording
    - Add detailed key history and diff generation
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ]* 10.3 Write property tests for audit and reporting
    - **Property 14: Audit and Reporting**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 11. Integration and End-to-End Testing
  - [ ] 11.1 Wire all components together
    - Integrate pipeline components in main CLI orchestrator
    - Add proper error handling and cleanup throughout
    - _Requirements: All requirements_

  - [ ]* 11.2 Write integration tests
    - Test complete workflows with mock LLM providers
    - Test error scenarios and recovery mechanisms
    - _Requirements: All requirements_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The implementation follows TypeScript best practices with comprehensive error handling
- All file operations use atomic writes to prevent corruption
- The system is designed for deterministic, reproducible builds
- Interactive features include real-time progress monitoring and token consumption tracking
- Streaming support enables verbose monitoring of LLM responses during translation
- Multiple LLM provider support ensures flexibility and adaptability