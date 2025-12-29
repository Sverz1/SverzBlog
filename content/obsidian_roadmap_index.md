# LLM Security Research Roadmap

**Version:** 1.0  
**Last Updated:** December 29, 2025  
**Duration:** 10 Weeks  
**Prerequisite:** Basic ML/NLP knowledge

---

## Overview

This roadmap provides a structured path through LLM security research, from foundational surveys to advanced red teaming. Each week builds on previous concepts with clear paper recommendations and practical objectives.

---

## Structure

### **Weeks 1-2: Foundations**
- [[week-01-threat-landscape|Week 1: Threat Landscape]]
- [[week-02-alignment-mechanisms|Week 2: Alignment Mechanisms]]

Core surveys, taxonomies, and alignment basics (RLHF, Constitutional AI, DPO).

### **Weeks 3-4: Core Attacks**
- [[week-03-jailbreaking|Week 3: Jailbreaking]]
- [[week-04-automated-attacks|Week 4: Automated Attacks]]

Manual and automated prompt injection techniques (PAIR, TAP, AutoDAN).

### **Weeks 5-6: Advanced Systems**
- [[week-05-agent-security|Week 5: Agent Security]]
- [[week-06-rag-multimodal|Week 6: RAG & Multimodal]]

Agent vulnerabilities, RAG injection, vision-language attacks.

### **Weeks 7-8: Specialized Attacks**
- [[week-07-privacy-extraction|Week 7: Privacy & Extraction]]
- [[week-08-domain-applications|Week 8: Domain Applications]]

Model extraction, privacy attacks, healthcare/cybersecurity domains.

### **Weeks 9-10: Defense & Practice**
- [[week-09-defense-mechanisms|Week 9: Defense Mechanisms]]
- [[week-10-red-teaming|Week 10: Red Teaming]]

Guardrails, detection methods, practical red teaming frameworks.

---

## Key Papers by Week

| Week | Primary Paper | arXiv/DOI | Type |
|------|--------------|-----------|------|
| 1 | Security Concerns Survey | 2505.18889 | Survey |
| 2 | RLHF & Constitutional AI | Tutorial | Review |
| 3 | Foot In The Door | 2402.15690 | Research |
| 4 | PAIR & TAP | 2310.08419, 2312.02119 | Research |
| 5 | AgentDojo | 2406.13352 | Benchmark |
| 6 | RAG Prompt Injection | 2511.15759 | Research |
| 7 | Model Extraction Survey | 2506.22521 | Survey |
| 8 | AthenaBench | 2511.01144 | Domain |
| 9 | JBShield | USENIX 2025 | Defense |
| 10 | Red Teaming Roadmap | 2506.05376 | Methodology |

---

## Learning Objectives

**By Week 2:** Understand all threat categories and alignment mechanisms  
**By Week 4:** Implement basic jailbreaks and automated attacks  
**By Week 6:** Analyze agent and RAG vulnerabilities  
**By Week 8:** Conduct privacy attacks and domain-specific analysis  
**By Week 10:** Deploy defense mechanisms and run red teaming campaigns

---

## Core Concepts

### Attack Types
- [[prompt-injection|Prompt Injection]] - Direct and indirect manipulation
- [[jailbreaking|Jailbreaking]] - Safety bypass techniques
- [[adversarial-attacks|Adversarial Attacks]] - Input perturbations
- [[data-poisoning|Data Poisoning]] - Training-time threats
- [[model-extraction|Model Extraction]] - IP and privacy theft

### Defense Methods
- [[input-validation|Input Validation]] - Sanitization and filtering
- [[output-filtering|Output Filtering]] - Response verification
- [[alignment-training|Alignment Training]] - RLHF and DPO
- [[guardrails|Guardrails]] - Multi-layer defense systems

### System Types
- [[agent-security|Agent Security]] - Tool-use vulnerabilities
- [[rag-security|RAG Security]] - Retrieval-augmented generation
- [[multimodal-security|Multimodal Security]] - Vision-language models

---

## Tools & Frameworks

- [[promptfoo|Promptfoo]] - Black-box red teaming
- [[agentdojo|AgentDojo]] - Agent security benchmark
- [[garak|Garak]] - Vulnerability scanner
- [[pyrit|Pyrit]] - Microsoft red teaming orchestration

---

## How to Use This Roadmap

1. Follow the weekly progression sequentially
2. Complete primary paper readings before moving forward
3. Use internal links to explore connected concepts
4. Implement practical exercises with recommended tools
5. Track progress using the objectives checklist

---

## Standards & References

- [[owasp-llm-top-10|OWASP LLM Top 10]] - Industry standard
- [[bibliography|Bibliography]] - Complete paper list
- [[glossary|Glossary]] - Technical terminology

---

**Next:** [[week-01-threat-landscape|Week 1: Threat Landscape]]