import { Component } from '@angular/core';
import swal from 'sweetalert2';
import * as L from 'leaflet';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {

  isTracking = false;
  isMenuOpen = false;

  searchText: string = '';
  searchResults: any[] = [];
  isLoading = false;
  selectedLat: number | null = null;
  selectedLng: number | null = null;
  radius: number = 100;

  watchId: any;
  alarmTriggered = false;
  currentDistance: number | null = null;
  private searchTimeout: any;

  ringtones = [
  { name: 'Warning', file: 'assets/alarm/alarm.mp3' },
  { name: 'Mor baniyo', file: 'assets/alarm/radha_rani1.mp3' },
  { name: 'Radha Radha', file: 'assets/alarm/radha_radha.mp3' }
  ];

 selectedRingtone = 'assets/alarm/radha_rani1.mp3';

  map!: L.Map;
  destinationMarker!: L.Marker;
  userMarker!: L.Marker;
  radiusCircle!: L.Circle;

  ngAfterViewInit() {
  this.map = L.map('map').setView([28.6139, 77.2090], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(this.map);
  }

  onSearchChange() {
    clearTimeout(this.searchTimeout);

    if (!this.searchText || this.searchText.length < 3) {
      this.searchResults = [];
      return;
    }

    this.isLoading = true;

    this.searchTimeout = setTimeout(() => {
      this.fetchLocations();
    }, 400); // debounce
  }

  fetchLocations() {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${this.searchText}`, {
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(res => res.json())
      .then(data => {
        this.searchResults = data.slice(0, 5); // limit results
        this.isLoading = false;
      })
      .catch(() => {
        this.searchResults = [];
        this.isLoading = false;
      });
  }

  selectPlace(place: any) {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);

    this.selectedLat = lat;
    this.selectedLng = lng;

    this.searchText = place.display_name;
    this.searchResults = [];
    if (this.destinationMarker) {
    this.map.removeLayer(this.destinationMarker);
    }

    this.destinationMarker = L.marker([lat, lng]).addTo(this.map);
    this.map.setView([lat, lng], 15);

    // Draw circle
    if (this.radiusCircle) {
      this.map.removeLayer(this.radiusCircle);
    }

    this.radiusCircle = L.circle([lat, lng], {
      radius: this.radius,
      color: 'blue',
      fillOpacity: 0.2
    }).addTo(this.map);

    console.log('Selected:', { lat, lng });
  }

  clearSearch() {
    this.searchText = '';
    this.searchResults = [];
  }

  useCurrentLocation() {
    this.isLoading = true;

    let bestAccuracy = Infinity;
    let bestPosition: any = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = pos.coords.accuracy;

        console.log("Accuracy:", accuracy);

        // Keep best (lowest) accuracy
        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy;
          bestPosition = pos;
        }

        // Stop when accuracy is good enough
        if (accuracy <= 150) {
          navigator.geolocation.clearWatch(watchId);

          const lat = bestPosition.coords.latitude;
          const lng = bestPosition.coords.longitude;

          this.selectedLat = lat;
          this.selectedLng = lng;
          this.map.setView([lat, lng], 15);

          this.reverseGeocode(lat, lng);
        }
      },
      (error) => {
        this.isLoading = false;
        console.error(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  reverseGeocode(lat: number, lng: number) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(res => res.json())
      .then(data => {

        const address = data.display_name;

        // ✅ Show in search bar
        this.searchText = address;

        // ✅ Clear dropdown
        this.searchResults = [];

        // ✅ Stop loader
        this.isLoading = false;

        console.log('Current Location Selected:', {
          lat,
          lng,
          address
        });

        // 👉 (Next step) emit to parent if needed
        // this.locationSelected.emit({ lat, lng, address });

      })
      .catch(() => {
        this.isLoading = false;
      });
  }

  startTracking() {
  if (!this.selectedLat || !this.selectedLng) {
    alert('Please select a location first');
    return;
  }
  console.log('Starting tracking to:', {
    lat: this.selectedLat,
    lng: this.selectedLng,
    radius: this.radius
  });
  this.alarmTriggered = false;

  this.watchId = navigator.geolocation.watchPosition(
    (pos) => {

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const distance = this.getDistance(
        lat,
        lng,
        this.selectedLat!,
        this.selectedLng!
      );
      if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }

    this.userMarker = L.marker([lat, lng]).addTo(this.map);
      this.currentDistance = Math.round(distance);
 
      if (distance <= this.radius && !this.alarmTriggered) {
        console.log('🎯 Target reached! Triggering alarm...');
        this.triggerAlarm();
        this.alarmTriggered = true;
      }else if (distance > 200 && !this.alarmTriggered) {
        navigator.vibrate([200]);
        const msg = new SpeechSynthesisUtterance("You are 200 meters away from your destination. Keep going!");
        speechSynthesis.speak(msg);
      }else if (distance > 100 && !this.alarmTriggered) {
        navigator.vibrate([200]);
        const msg = new SpeechSynthesisUtterance("You are 100 meters away from your destination. Almost there!");
        speechSynthesis.speak(msg);
      }
    },
    (err) => console.error(err),
    {
      enableHighAccuracy: true,
      maximumAge: 0
    }
  );
}

  getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;

  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2 - lat1) * Math.PI/180;
  const Δλ = (lon2 - lon1) * Math.PI/180;

  const a =
    Math.sin(Δφ/2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ/2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

triggerAlarm() {
  navigator.vibrate([500, 200, 500]);
  const audio = new Audio(this.selectedRingtone);
  audio.play();
  swal.fire({
    title: '🎯 Target Reached!',
    text: 'You have arrived at your destination.',
    icon: 'success'
  });
  // alert('🎯 You reached your destination!');
}

stopTracking() {
  if (this.watchId) {
    navigator.geolocation.clearWatch(this.watchId);
  }
}

updateCircle() {
  if (this.radiusCircle && this.selectedLat && this.selectedLng) {
    this.radiusCircle.setRadius(this.radius);
  }
}


toggleTracking() {
  if (this.isTracking) {
    this.stopTracking();
    this.isTracking = false;
  } else {
    this.startTracking();
    this.isTracking = true;
  }
}

toggleMenu() {
  this.isMenuOpen = !this.isMenuOpen;
}

}
