// Java-style independent rain/thunder timers, in 20 Hz game ticks.
export const WEATHER_DURATIONS = Object.freeze({clear:[12000,180000],rain:[12000,24000],quietThunder:[12000,180000],thunder:[3600,15600]});
export class WeatherClock {
  constructor(random=Math.random){this.random=random;this.raining=false;this.thundering=false;this.rainTicks=this.duration('clear');this.thunderTicks=this.duration('quietThunder');this.clearTicks=0;}
  duration(kind){const [lo,hi]=WEATHER_DURATIONS[kind];return lo+Math.floor(this.random()*(hi-lo+1));}
  get type(){return this.raining?(this.thundering?'thunder':'rain'):'clear';}
  set(type,seconds=null){
    if(!['clear','rain','thunder'].includes(type))return false;
    if(seconds!==null&&(!Number.isFinite(seconds)||seconds<=0||seconds>1000000))return false;
    this.raining=type!=='clear';this.thundering=type==='thunder';this.clearTicks=0;
    this.rainTicks=seconds!==null?seconds*20:this.duration(this.raining?'rain':'clear');
    this.thunderTicks=seconds!==null?seconds*20:this.duration(this.thundering?'thunder':'quietThunder');
    if(type==='clear'&&seconds!==null){this.clearTicks=seconds*20;this.rainTicks=this.duration('clear');this.thunderTicks=this.duration('quietThunder');}
    return true;
  }
  advance(seconds,enabled=true){
    if(!enabled||!Number.isFinite(seconds)||seconds<=0)return;
    let ticks=seconds*20;
    if(this.clearTicks>0){const held=Math.min(ticks,this.clearTicks);this.clearTicks-=held;ticks-=held;this.raining=this.thundering=false;}
    while(ticks>0){
      const step=Math.min(ticks,Math.max(0,this.rainTicks),Math.max(0,this.thunderTicks));
      ticks-=step;this.rainTicks-=step;this.thunderTicks-=step;
      if(this.rainTicks<=0){this.raining=!this.raining;this.rainTicks=this.duration(this.raining?'rain':'clear');}
      if(this.thunderTicks<=0){this.thundering=!this.thundering;this.thunderTicks=this.duration(this.thundering?'thunder':'quietThunder');}
    }
  }
  resetAfterSleep(){if(this.raining)this.set('clear');}
  snapshot(){return {weatherType:this.type,isRaining:this.raining,raining:this.raining,thundering:this.thundering,rainTicks:this.rainTicks,thunderTicks:this.thunderTicks,clearTicks:this.clearTicks};}
  restore(raw={}){
    this.set(['clear','rain','thunder'].includes(raw.weatherType)?raw.weatherType:raw.isRaining?'rain':'clear');
    for(const key of ['rainTicks','thunderTicks','clearTicks'])if(Number.isFinite(raw[key])&&raw[key]>=0)this[key]=raw[key];
    if(typeof raw.raining==='boolean')this.raining=raw.raining;
    if(typeof raw.thundering==='boolean')this.thundering=raw.thundering;
  }
}
export function captureWeatherState(weather){
  if(weather?.captureState)return weather.captureState();
  const raining=typeof weather?.isRaining==='function'?weather.isRaining():!!weather?.isRaining;
  return {weatherType:weather?.weatherType??(raining?'rain':'clear'),isRaining:raining,rainIntensity:weather?.rainIntensity||0};
}
export function restoreWeatherState(weather,state){
  if(!state||!weather)return;
  if(weather.restoreState)weather.restoreState(state);
  else weather.setWeather?.(state.weatherType??(state.isRaining?'rain':'clear'));
}
