import Foundation
import React
import EventKit

@objc(CueCompanion)
class CueCompanion: RCTEventEmitter {
    private var observer: NSObjectProtocol?
    private var observing = false
    private var calendarObserver: NSObjectProtocol?

    override init() {
        super.init()
        observer = NotificationCenter.default.addObserver(forName: CueCompanionService.changed, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.observing else { return }
            self.sendEvent(withName: "cueRemindersChanged", body: nil)
        }
        calendarObserver = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: .main) { _ in
            Task { await CueCompanionService.shared.calendarDidChange() }
        }
    }
    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        if let calendarObserver { NotificationCenter.default.removeObserver(calendarObserver) }
    }
    @objc override static func requiresMainQueueSetup() -> Bool { false }
    override func supportedEvents() -> [String]! { ["cueRemindersChanged"] }
    override func startObserving() { observing = true }
    override func stopObserving() { observing = false }

    private func perform(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock, work: @escaping () async throws -> Any) {
        Task {
            do { resolve(try await work()) }
            catch { reject("cue_companion", error.localizedDescription, error) }
        }
    }

    @objc func getReminders(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.loadJSON() as Any? ?? NSNull() }
    }
    @objc func seedReminders(_ json: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.seed(json) }
    }
    @objc func configureCloud(_ url: String, token: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.configureCloud(url, token: token); return NSNull() }
    }
    @objc func getCloudConfiguration(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.cloudConfiguration() as Any? ?? NSNull() }
    }
    @objc func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { await CueCompanionService.shared.status() }
    }
    @objc func setEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.setEnabled(enabled) }
    }
    @objc func capture(_ text: String, source: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.capture(text, source: source).remindersJSON }
    }
    @objc func ask(_ text: String, source: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) {
            let result = try await CueCompanionService.shared.capture(text, source: source)
            return ["remindersJSON": result.remindersJSON, "reply": result.reply]
        }
    }
    @objc func getCalendarStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { await CueCompanionService.shared.calendarStatus() }
    }
    @objc func setCalendarConnected(_ connected: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.setCalendarConnected(connected) }
    }
    @objc func toggle(_ id: String, completed: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.toggle(id, completed: completed) }
    }
    @objc func remove(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.remove(id) }
    }
    @objc func refresh(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        perform(resolve, reject) { try await CueCompanionService.shared.refresh(); return NSNull() }
    }
}
