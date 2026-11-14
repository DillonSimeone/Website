class_name RunDirector
extends Node

signal xp_popup(amount: int, reason: String)
signal leveled(choices: Array)
signal wrecked

var xp := 0
var level := 1
var into := 0
var need := 120
var integrity := 100.0
var distance := 0.0
var meter_bank := 0.0
var owned := {}
var rng := RandomNumberGenerator.new()
var active := true
var choosing := false

func setup(seed_value: int) -> void:
	rng.seed = seed_value + 97

func add_xp(amount: int, reason: String, popup: bool = true) -> void:
	if not active or choosing or amount <= 0:
		return
	xp += amount
	into += amount
	if popup:
		xp_popup.emit(amount, reason)
	if into >= need and active:
		into -= need
		level += 1
		need = 70 + level * 50
		choosing = true
		leveled.emit(Upgrades.roll(3, owned, rng))

func choose(index: int, choices: Array, vehicle: Vehicle) -> void:
	if index < 0 or index >= choices.size():
		return
	var entry: Dictionary = choices[index]
	Upgrades.apply(str(entry.id), vehicle, self)
	choosing = false
	if integrity <= 0.0:
		active = false
		wrecked.emit()

func note_distance(delta_m: float) -> void:
	if not active or choosing:
		return
	if delta_m < 0.0 or delta_m > 15.0:
		return
	distance += delta_m
	meter_bank += delta_m
	if meter_bank >= 10.0:
		var chunk := int(meter_bank)
		meter_bank -= chunk
		add_xp(int(round(chunk * 1.15)), "Distance", false)

func hurt(amount: float) -> void:
	if not active:
		return
	integrity = maxf(0.0, integrity - amount)
	if integrity <= 0.0:
		active = false
		wrecked.emit()
